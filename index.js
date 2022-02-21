const Notifier = require('./notify');
const log = require('ulog')('WQA');
const inquirer = require('inquirer');
const { config } = require('./utils');
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
            await setup(argv, recognizer.notifier);
            break;
        }
        case 'exit': {
            return;
        }
    }
    await interactiveStart(argv, recognizer);
}

async function setup(argv, notifier) {
    await notifier.init(config.PUSHBULLET.API_KEY, argv);
}

async function main(args) {
    const argv = parseArgs(args.slice(2));

    const notifier = new Notifier();
    const recognizer = new QueueRecognizer(argv, notifier, bottomBar);

    recognizer.startTime = new Date().setHours(12, 45);
    recognizer.startPos = 14500;

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
