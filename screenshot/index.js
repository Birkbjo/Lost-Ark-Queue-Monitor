const path = require('path');
const util = require('util');
const edge = require('edge-js');
const sharp = require('sharp');

const cSharpFile = path.join(__dirname, 'WinScreenshot.cs');
// Create a reference to the C# function.
const invoke = util.promisify(edge.func(cSharpFile));

const api = {
    screenshotWindowName: (name, file = undefined) =>
        invoke({ cmd: 'screenshotWindowName', name, file }),

    /**
     * List applications with hwnd
     *  [{ windowName: hwnd }]
     */
    listWindows: () => invoke({ cmd: 'listWindows' }),
    /**
     * List monitors with additional info
     * [{ deviceName, top, right, bottom, left, dpsiScale }]
     */
    listMonitors: () => invoke({ cmd: 'listMonitors' }),

    /**
     * returns the hwnd of the window
     */
    getWindow: (name) => invoke({ cmd: 'getWindow', name }),
};

module.exports = api;
api.listWindows().then((res) => console.log(res));
api.screenshotWindowName('cmder', 'tester')
    .then((res) => {
        console.log('finito,', res);
        //sharp(res).toFile('fromcs.png');
    })
    .catch((e) => {
        console.log('failed', e);
    });
