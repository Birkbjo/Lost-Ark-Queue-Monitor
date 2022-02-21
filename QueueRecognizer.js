const screenshot = require('screenshot-desktop');
const { TesseractWorker, OEM, PSM, createWorker } = require('tesseract.js');
const Notifier = require('./notify');
const fs = require('fs');
const path = require('path');
const log = require('ulog')('WQA');
const sharp = require('sharp');
const inquirer = require('inquirer');
const childProcess = require('child_process');
const { writeConfig, sleep, config, playSound } = require('./utils');

class QueueRecognizer {
    constructor({ debug, mute, fullCapture }, notifier, bottomBar) {
        this.notifier = notifier;
        this.debug = debug;
        this.mute = mute;
        this.fullCapture = fullCapture;

        this.bottomBar = bottomBar;
        this.ocrWorker = createWorker({
            logger: (p) => {
                this.bottomBar.updateBottomBar(
                    `${p.status}: ${Math.round(p.progress * 100)}% `
                );
            },
        });
        this.startTime = null;
        this.startPos = null;
        this.positionNotificationSent = false;
        this.lastNotificationTime = new Date();

        this.pos = null;
    }

    async run(argv) {
        await this.ocrWorker.load();
        await this.ocrWorker.loadLanguage('eng');
        await this.ocrWorker.initialize('eng');

        const sleepT = config.CHECK_INTERVAL || 60000;
        let loggedIn = false;
        let lastUpdate = new Date();
        let retryNoQueue = 10;

        log.info('Lost Ark Queue Notifier running... (Press Ctrl+C to exit)');
        while (loggedIn === false) {
            const img = await screenShot(config.DISPLAY);
            let [screenText, words] = await this.recognize(img);
            if (!screenText) {
                log.error('No screentext found');
                // check for logged in
                //process.exit(-1);
            }
            loggedIn = await this.isProbablyLoggedIn(words, img);
            if (!loggedIn) {
                const didNotify = this.handleNotLoggedIn(
                    words,
                    retryNoQueue,
                    lastUpdate
                );

                if (didNotify) {
                    lastUpdate = new Date();
                }
                await sleep(sleepT);
            }
        }
        log.info('\nQueue complete! Shutting down...');
        this.ocrWorker.terminate();

        await this.queueFinished(argv);
    }

    async isProbablyLoggedIn(tesseractWords, img) {
        // if (tesseractWords.length < 1) {
        //     return false;
        // }
        const minMatches = 2;
        const loggedInWords = [
            'launch',
            'reskin',
            'change',
            'name',
            'delete',
            'character',
            'settings',
        ];
        const queueWords = ['waiting', 'server', 'queue', 'number'];

        const countWords = (tessWords) => {
            let queueWordMatches = [];
            let loggedInMatches = [];
            for (let tw of tessWords) {
                const w = tw.text.toLowerCase();
                if (queueWords.includes(w)) {
                    queueWordMatches.push(w);
                }
                if (loggedInWords.includes(w)) {
                    loggedInMatches.push(w);
                }
            }
            return [queueWordMatches, loggedInMatches];
        };

        let [queueWordMatches, loggedInMatches] = countWords(tesseractWords);

        if (queueWordMatches.length <= minMatches) {
            log.debug('No queue found, check if logged in');
            const imageMetadata = await sharp(img).metadata();
            console.log(imageMetadata);
            let [screenText, words] = await this.recognize(img, {
                left: imageMetadata.width / 2 - 250,
                top: imageMetadata.height - 120,
                width: imageMetadata.width - (imageMetadata.width / 2 - 250),
                height: 120,
            });
            [queueWordMatches, loggedInMatches] = countWords(words);
            console.log(queueWordMatches, loggedInMatches);
        }
        return (
            loggedInMatches.length >= minMatches &&
            queueWordMatches.length < minMatches
        );
    }

    recognizeQueuePosition(tesseractWords) {
        const words = tesseractWords.map((w) => w.text.toLowerCase());
        const positionKeywords = ['your', 'queue', 'number'];

        for (let i = 0; i < words.length; i++) {
            let w = words[i];
            if (positionKeywords.includes(w)) {
                //OCR may fail some words, so we try some positions ahead
                const pos = findNumber(words, i, i + 3);
                if (pos && !this.startPos) {
                    this.startPos = pos;
                }
                this.pos = pos;
                return pos;
            }
        }
        return null;
    }

    async recognize(img, extractOpts) {
        const imageMetadata = await sharp(img).metadata();
        console.log(imageMetadata);
        if (!extractOpts) {
            extractOpts = {
                left: imageMetadata.width / 2 - 250,
                top: imageMetadata.height / 2 - 150,
                width: 500,
                height: 250,
            };
        }
        if (!this.fullCapture) {
            const rectImg = await sharp(img)
                .extract(extractOpts)
                .sharpen()
                .threshold(120);

            // await rectImg.toFile('rect.png');
            img = await rectImg.toBuffer();
        } else {
            img = await sharp(img).threshold(120).toBuffer();
        }

        const job = this.ocrWorker.recognize(img);

        if (this.debug) {
            rectImg.toFile('rect.png');
        }

        try {
            const res = await job;
            const data = res.data;
            log.debug(data.text);
            return [data.text, data.words];
        } catch (e) {
            log.error('Recognizer failed', e);
            return [null, null];
        }
    }

    handlePositionUpdate(pos, lastUpdate) {
        const updateThreshold = config.UPDATE_INTERVAL || 1800000; // 30 min
        const positionThreshold = config.POSITION_THRESHOLD || 200;
        const now = new Date();
        //log.debug('Position:', pos, ' Estimated time:', time);
        const positionSend =
            !this.positionNotificationSent && pos <= positionThreshold;

        if (positionSend) {
            log.debug('Position below threshold, sending notification');
            this.positionNotificationSent = true;
        }
        log.debug(now - lastUpdate);
        if (positionSend || now - lastUpdate >= updateThreshold) {
            if (this.notifier.active) {
                this.notifier.notify(
                    'Queue position update',
                    `You are now in position: ${pos}.`
                );
                this.lastNotificationTime = new Date();
            }
            return true;
        }
        return false;
    }

    handleNotLoggedIn(words, retries, lastUpdate, startTime, startPos, img) {
        const pos = this.recognizeQueuePosition(words);
        let didNotify = false;
        let posStr = pos ? `Position: ${pos}.\n` : '';
        if (pos) {
            didNotify = this.handlePositionUpdate(pos, lastUpdate);
        } else {
            if (retries-- < 1) {
                log.warn(
                    'Queue not recognized for a long time, shutting down...'
                );
                if (this.notifier.active) {
                    this.notifier.notify(
                        'Lost Ark Queue Notifier shut down',
                        'Could not recognize queue position for a long time. Please verify Lost Ark is running.'
                    );
                }
                process.exit(-1);
            }
            log.warn(
                `Queue not recognized. Is Lost Ark running on the specified monitor (${config.DISPLAY})?`
            );
        }
        this.bottomBar.updateBottomBar(`${posStr}Waiting for next check...`);
        return didNotify;
    }

    async queueFinished(argv) {
        if (this.notifier.active) {
            const body = "It's your turn to play, get ready!";
            this.notifier.notify('Lost Ark queue complete!', body);
        }
        if (!this.mute && config.PLAY_SOUND) {
            try {
                await playSound(config.PLAY_SOUND);
            } catch (e) {
                log.error('Failed to play sound:', e.message);
            }
        }
    }

    async dryRun(argv) {
        const displays = await screenshot.listDisplays();
        for (d in displays) {
            const display = displays[d];
            screenShot(display.id, d).catch((err) => {
                log.error('Failed to screenshot:', err);
            });
        }
        await this.queueFinished(argv);
    }
}

async function screenShot(screen = 0, filename = null) {
    if (filename) {
        filename = `${filename}.png`;
    }

    const img = await screenshot({ filename, format: 'png', screen });
    return img;
}

async function screenShotTest(screen = 0, filename = null) {
    if (filename) {
        filename = `${filename}.png`;
    }

    const img = await screenshot({ filename, format: 'png', screen });
    return img;
}

async function processImage(img) {
    const processed = await sharp(img)
        // Black pixels below threshold, white above = way easier for OCR to recognize text
        .threshold(120)
        .png()
        //.negate()
        .toBuffer();

    return processed;
}

function findNumber(arr, start, end) {
    for (let i = end; i > start && i < arr.length; i--) {
        const parsed = parseInt(arr[i]);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
}

async function screenshotBackground(filename = 'screenshot') {
    await new Promise((resolve, reject) => {
        childProcess.exec(
            'python lost-ark-screenshot.py',
            {
                timout: 5000,
            },
            (err, stdout, stderr) => {
                if (err) {
                    console.log('Failed to take screenshot using python');
                    if (err.code == 1) {
                        console.log(
                            '\nSeems like you do not have python installed. Please install it to use this feature.\n'
                        );
                    }

                    console.log(err.message);
                    reject(err);
                } else {
                    console.log(err, stdout, stderr);
                    resolve();
                }
            }
        );
    });

    const image = await sharp('screenshot.png')
        .sharpen()
        .threshold(120)
        .toBuffer();
    //.toFile('test.png');
}
screenShotTest(0, 'testing');
module.exports = QueueRecognizer;
