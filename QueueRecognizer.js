const { createWorker } = require('tesseract.js');
const Notifier = require('./notify');
const log = require('ulog')('WQA');
const sharp = require('sharp');
const { sleep, config, playSound, formatSecondsToTime } = require('./utils');

const WinScreenshot = require('./screenshot/index.js');
const MAX_RETRIES = 10

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

        this.retries = MAX_RETRIES;
    }

    async terminate() {
        await this.ocrWorker.terminate();
        this.bottomBar.close();
    }

    async run(argv) {
        await this.ocrWorker.load();
        await this.ocrWorker.loadLanguage('eng');
        await this.ocrWorker.initialize('eng');

        const sleepT = config.CHECK_INTERVAL || 60000;
        let loggedIn = false;
        this.startTime = this.startTime ? this.startTime : new Date();

        this.bottomBar.log.write(
            'Lost Ark Queue Notifier running... (Press Ctrl+C to exit)'
        );
        while (loggedIn === false) {
            const img = await this.screenshot();
            let [screenText, words] = await this.recognize(img);

            log.debug(screenText);
            if (!screenText) {
                log.error('No screentext found');
            }
            loggedIn = await this.isProbablyLoggedIn(words, img);
            if (!loggedIn) {
                await this.handleNotLoggedIn(words);

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
        const queueWords = [
            'waiting',
            'overloaded',
            'moment',
            'server',
            'queue',
            'number',
            'pleaase',
            'wait',
        ];

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

        if (queueWordMatches.length < minMatches) {
            log.debug('No queue found, check if logged in');
            let [screenText, words] = await this.recognize(
                img,
                IMAGE_POSITION.BOTTOM
            );
            [queueWordMatches, loggedInMatches] = countWords(words);
        }
        log.debug({ queueWordMatches, loggedInMatches });
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

    async screenshot() {
        try {
            // return sharp('./unknown.png').toBuffer();
            const ss = await WinScreenshot.screenshotWindowName('lost ark');
            return ss;
        } catch (e) {
            if (e.name === WindowNotFoundException) {
                this.bottomBar.log.write(
                    'Lost Ark Window not found, is Lost Ark running?'
                );
            }
            log.error('Failed to take screenshot: ', e);
        }
    }

    async processScreenshot(img, imagePosition = IMAGE_POSITION.CENTER) {
        let s = sharp(img);

        if (this.debug) {
            s.toFile('screenshot.png');
        }
        if (!this.fullCapture) {
            const metadata = await s.metadata();
            const extractOpts = await getExtractImageOptions(
                metadata,
                imagePosition
            );
            s.extract(extractOpts);
        }
        const threshold = config.PIXEL_THRESHOLD || 70;
        return s.threshold(threshold);
    }

    async recognize(img, processOpts = { position: IMAGE_POSITION.CENTER }) {
        if (processOpts) {
            img = await this.processScreenshot(img, processOpts.position);
        } else {
            img = await sharp(img);
        }

        const imgBuffer = await img.toBuffer();
        const job = this.ocrWorker.recognize(imgBuffer);

        if (this.debug) {
            await img.toFile('processed.png');
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

    handlePositionUpdate(pos) {
        const updateThreshold = config.UPDATE_INTERVAL || 1800000; // 30 min
        const positionThreshold = config.POSITION_THRESHOLD || 200;
        const now = new Date();
        const lastUpdate = this.lastNotificationTime;

        if (this.startPos == null) {
            this.startPos = pos;
        }

        const positionSend =
            !this.positionNotificationSent && pos <= positionThreshold;

        if (positionSend) {
            positionNotificationSent = true;
            log.debug('Position below threshold, sending notification');
        }
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

        const { estimatedTime, etaDate } = this.getEstimatedTime(pos);
        const etaStr = etaDate.toTimeString().substr(0, 8);
        this.bottomBar.updateBottomBar(
            `Position: ${pos}. Estimated time left: ${estimatedTime}. Eta: ${etaStr}`
        );
        return false;
    }

    async handleNotLoggedIn(words) {
        const pos = this.recognizeQueuePosition(words);

        if (pos) {
            this.handlePositionUpdate(pos);
            this.retries = MAX_RETRIES;
        } else {
            if (this.retries-- < 1) {
                this.bottomBar.log.write(
                    'Queue not recognized for a long time, shutting down...'
                );
                if (this.notifier.active) {
                    this.notifier.notify(
                        'Lost Ark Queue Notifier shut down',
                        'Could not recognize queue position for a long time. Please verify Lost Ark is running.'
                    );
                }
                await this.terminate();
                process.exit(-1);
            }
            this.bottomBar.log.write(
                `Lost Ark window found, but queue not recognized. Are you sure you are in queue?`
            );
            this.bottomBar.log.write(
                'If this continues, please rerun with --debug and check the output of the screenshot.png and processed.png'
            );
        }
        //this.bottomBar.updateBottomBar(`${posStr}Waiting for next check...`);
    }

    getEstimatedTime(pos) {
        if (!this.startTime || pos === this.startPos) {
            return {
                estimatedTime: null,
                etaDate: null,
            };
        }

        const deltaPos = this.startPos - pos;
        const deltaTimeSeconds = Math.floor(
            (new Date() - this.startTime) / 1000
        );
        const posPerSec = deltaPos / deltaTimeSeconds;
        const secondsLeft = Math.floor(pos / posPerSec);

        return {
            estimatedTime: formatSecondsToTime(secondsLeft),
            etaDate: new Date(Date.now() + secondsLeft * 1000),
        };
    }

    async queueFinished(argv) {
        if (this.notifier.active) {
            log.info('Notifying your devices');
            const body = "It's your turn to play, get ready!";
            this.notifier.notify('Lost Ark queue complete!', body);
        }
        if (!this.mute && config.PLAY_SOUND) {
            try {
                log.debug('Playing sound alert');
                await playSound(config.PLAY_SOUND);
            } catch (e) {
                log.error('Failed to play sound:', e.message);
            }
        }
    }

    async dryRun(argv) {
        const ss = await this.screenshot();
        await sharp(ss).toFile('screenshot.png');
        await this.queueFinished(argv);
        this.terminate();
    }
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

const IMAGE_POSITION = {
    CENTER: 'CENTER',
    BOTTOM: 'BOTTOM',
};

const extractImagePosition = {
    CENTER: (imageMetadata) => ({
        left: imageMetadata.width / 2 - 250,
        top: imageMetadata.height / 2 - 150,
        width: 500,
        height: 250,
    }),
    BOTTOM: (imageMetadata) => ({
        left: imageMetadata.width / 2 - 250,
        top: imageMetadata.height - 120,
        width: imageMetadata.width - (imageMetadata.width / 2 - 250),
        height: 120,
    }),
};

const getExtractImageOptions = (metadata, imagePosition) =>
    extractImagePosition[imagePosition](metadata);

module.exports = QueueRecognizer;
