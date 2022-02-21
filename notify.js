const { promisify } = require('util');
const Pushbullet = require('pushbullet');
const inquirer = require('inquirer');
const log = require('ulog')('notifier');
const { writeConfig, config } = require('./utils.js');

class Notifier {
    constructor() {
        this.active = false;
        this.lastNotificationDate = null;
    }

    async init(apiKey, argv) {
        if (!apiKey) {
            if (argv.setup) {
                apiKey = await this.askApiKey();
            }
            if (!apiKey) {
                log.info('Notifier not configured. Rerun with -s to setup.');
                return;
            }
            config.PUSHBULLET.API_KEY = apiKey;
            writeConfig();
        }

        this.createPB(apiKey);

        if (
            (!config.PUSHBULLET.DEVICE_ID &&
                config.PUSHBULLET.DEVICE_ID !== null) ||
            argv.setup
        ) {
            const success = await this.setupDevices();
            if (success) {
                this.active = true;
            } else {
                log.info('Failed to setup notifier');
            }
        } else {
            this.device = config.PUSHBULLET.DEVICE_ID;
            this.active = true;
        }
    }

    createPB(apiKey) {
        this.PB = new Pushbullet(apiKey);
        this.PB.note = promisify(this.PB.note);
        this.PB.devices = promisify(this.PB.devices);
        return this.PB;
    }

    async askApiKey() {
        const rightClickToPasteHint =
            process.platform === 'win32'
                ? 'Right-click to copy from clipboard'
                : '';
        const questions = [
            {
                type: 'confirm',
                message:
                    'No API key found, do you want to setup pushbullet now?',
                name: 'apiKeySetup',
            },
            {
                type: 'input',
                name: 'apiKey',
                when: (answers) => answers.apiKeySetup,
                message: `Input the Access Token from Pushbullet Account page (https://www.pushbullet.com/#settings/account)\n (${rightClickToPasteHint}):`,
            },
        ];
        const answers = await inquirer.prompt(questions);
        const apiKey = answers.apiKey;
        if (apiKey) {
            return apiKey;
        }
        return false;
    }

    setupQuestions(devices) {
        return [
            {
                type: 'list',
                message: 'Select a device to send notifications to:',
                name: 'device',
                choices: devices
                    .map((d) => ({
                        name: `${d.nickname} [${d.type}]`,
                        value: d,
                    }))
                    .concat({
                        name: 'All devices',
                        value: { nickname: 'All devices', iden: null },
                    }),
            },
        ];
    }

    async setupDevices() {
        try {
            const res = await this.PB.devices();
            if (!res.devices || res.devices.length < 1) {
                log.error('No devices found.');
                return;
            }
            const answer = await inquirer.prompt(
                this.setupQuestions(res.devices)
            );
            this.device = answer.device.iden;
            config.PUSHBULLET.DEVICE_ID = this.device;
            writeConfig();
            log.info(
                `Device set to: ${answer.device.nickname} (id:${answer.device.iden})`
            );
            return true;
        } catch (e) {
            log.error('Failed to get devices: ', e.message);
            return false;
        }
    }

    async notify(title, body) {
        let res;
        try {
            res = await this.PB.note(this.device, title, body);
            this.lastNotificationDate = new Date();
            log.debug('Notification sent!');
        } catch (e) {
            log.error('Failed to send notification: ', e);
        }
        return res;
    }
}

module.exports = Notifier;
