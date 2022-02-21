const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { promisify } = require('util');
const log = require('ulog')('utils');

const execFile = promisify(child_process.execFile);

const USER_CONFIG = 'config.json';
const configPath = (p) => path.join(__dirname, p);
const configLocs = ['default.config.json', USER_CONFIG].map(configPath);

let CONFIG = null;

function writeConfig(override) {
    fs.writeFileSync(
        path.join(__dirname, USER_CONFIG),
        JSON.stringify(override || CONFIG, null, 4).concat('\n'),
        'utf8'
    );
}

function loadFile(path) {
    try {
        return require(path);
    } catch (e) {
        return null;
    }
}

function getConfig() {
    if (CONFIG) {
        return CONFIG;
    }

    CONFIG = configLocs
        .map((cfg) => loadFile(cfg))
        .filter((cfg) => !!cfg)
        .reduce((acc, cfg) => ({ ...acc, ...cfg }), {});

    return CONFIG;
}

async function playSound(filePath) {
    const playPath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.join(__dirname, filePath));

    const opts = {
        timeout: 30000,
    };

    if (process.platform === 'win32') {
        return execFile(
            'cscript.exe',
            [path.join(__dirname, 'win32', 'wmplayer.vbs'), playPath],
            opts
        );
    } else if (process.platform === 'darwin') {
        return execFile('afplay', [playPath], opts);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSecondsToTime(secs) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor(secs / 60) % 60;
    const seconds = secs % 60;

    return [hours, minutes, seconds]
        .map((v) => (v < 10 ? '0' + v : v))
        .filter((v, i) => v !== '00' || i > 0)
        .join(':');
}

module.exports = {
    config: getConfig(),
    playSound,
    sleep,
    writeConfig,
    formatSecondsToTime,
};
