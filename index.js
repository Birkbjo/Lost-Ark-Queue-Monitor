const screenshot = require('screenshot-desktop');
const { TesseractWorker, OEM, PSM, createWorker } = require('tesseract.js');
const Notifier = require('./notify');
const fs = require('fs');
const path = require('path');
const log = require('ulog')('WQA');
const sharp = require('sharp');
const inquirer = require('inquirer');
const { writeConfig, sleep, config, playSound } = require('./utils');
const QueueRecognizer = require('./QueueRecognizer.js');

const bottomBar = new inquirer.ui.BottomBar();

function parseArgs(argv) {
    const parsedArgv = {
        debug: false,
        dryRun: false,
        setup: false,
        mute: false,
        interactive: false,
        fullCapture: false,
    };

    for (i in argv) {
        const arg = argv[i];
        switch (arg) {
            case '-d':
            case '--debug': {
                parsedArgv.debug = true;
                log.level = log.DEBUG;
                break;
            }
            case '--dry': {
                parsedArgv.dryRun = true;
                break;
            }
            case '-s':
            case '--setup': {
                parsedArgv.setup = true;
                break;
            }
            case '-m':
            case '--mute': {
                parsedArgv.mute = true;
                break;
            }
            case '-i':
            case '--interactive': {
                parsedArgv.interactive = true;
                break;
            }
            case '--fullCapture': {
                parsedArgv.fullCapture = true;
                break;
            }
        }
    }
    return parsedArgv;
}

async function interactiveStart(argv, recognizer) {
    const answers = await inquirer.prompt([
        {
            type: 'list',
            message: 'What do you want to do?',
            name: 'answer',
            choices: [
                {
                    name: 'Start Queue monitor',
                    value: 'run',
                },
                {
                    name: 'Dry run. Used for testing setup',
                    value: 'dryRun',
                },
                {
                    name: 'Run interactive setup',
                    value: 'setup',
                },
                {
                    name: 'Exit',
                    value: 'exit',
                },
            ],
        },
    ]);
    switch (answers.answer) {
        case 'run': {
            await recognizer.run(argv);
            break;
        }
        case 'dryRun': {
            await recognizer.dryRun(argv);
            break;
        }
        case 'setup': {
            argv.setup = true;
            await setup(argv, recognizer.notifer);
            break;
        }
        case 'exit': {
            return;
        }
    }
    await interactiveStart(argv);
}

async function interactiveDisplay(argv) {
    const displays = await screenshot.listDisplays();

    if (displays.length < 2) {
        log.info('Only one monitor found. Using primary.');
        return;
    }
    const answer = await inquirer.prompt([
        {
            type: 'list',
            message: 'Select the monitor that Lost Ark is running on:',
            name: 'display',
            choices: displays.map((d) => ({
                name: `${d.name} (id: ${d.id})${d.primary ? ' [Primary]' : ''}`,
                value: d,
            })),
        },
    ]);
    const display = answer.display;
    config.DISPLAY = display.id;
    writeConfig();
    log.info('Display selected:', display.name);
}

async function setup(argv, notifier) {
    await notifier.init(config.PUSHBULLET.API_KEY, argv);
    if (argv.setup) {
        await interactiveDisplay();
    }
}

async function main(args) {
    const argv = parseArgs(args.slice(2));

    const notifier = new Notifier();
    const recognizer = new QueueRecognizer(argv, notifier, bottomBar);

    if (argv.interactive) {
        await interactiveStart(argv, recognizer);
    } else {
        await setup(argv, notifier);
        if (argv.dryRun) {
            await recognizer.dryRun(argv);
        } else {
            await recognizer.run(argv);
        }
    }

    bottomBar.close();
}

main(process.argv);
