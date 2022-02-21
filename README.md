# Lost Ark Queue Monitor

A small Node.js application that monitors your Lost Ark queue and notifies you when it's your turn to play! It even works when Lost Ark is running in the background (see [Limitations](#limitations))!

## How does it work?

It's pretty simple: it takes a screenshot of your monitor and use [OCR](https://github.com/tesseract-ocr/) to
recognize key-words that should be present on the screen when you are in character select. [Pushbullet](https://www.pushbullet.com/) integration gives you a notifcation straight to your device!

There's no automation at play here!

## Installation

1. Download and install [Node.js](https://nodejs.org/en/)
2. Clone this repo (or download the [zip](https://github.com/Birkbjo/WoW-Queue-Alert/archive/master.zip))
3. Open a terminal and `cd` to the downloaded folder and run `npm install`.

### Easy mode

If you are not familiar with command lines, you can use the batch scripts in the `bin`-folder.
Just double-click the `quickstart.bat` and it will install dependencies and run the program.

### Terminal

1. Open a terminal and `cd` to the folder of this project.
2. `node index.js` or `npm start`

See [CLI options](#cli-options) for more arguments.

## Setup

By default it takes screenshots of Lost Ark, and plays an alert when it thinks you are in Character Select screen.

Ideally, you should try running the program on a character-select screen (eg. log into a low-population server), and verify that it recognizes that you are not in a queue. You can also use the `dry` command below to check that notification sound works (note that this may be loud).

### Notifications

To get notifications to your device:

1. Make a [Pushbullet](https://www.pushbullet.com/)-account (one-click signup with google and facebook).
2. Go to your [Account](https://www.pushbullet.com/#settings/account) and click 'Create Access Token'.
3. Open `config.json` and paste in the API-key under `PUSHBULLET.API_KEY`.
4. Download Pushbullet to your device. [Android](https://play.google.com/store/apps/details?id=com.pushbullet.android&hl=en). [iOS](https://apps.apple.com/us/app/pushbullet/id810352052).
5. Start the program with `npm start`, and follow the interactive device-selection.
6. Run `npm run dry` to do a dry-run and test your setup.

### Configuration

The user configuration-file is located in `config.json`. If you haven't ran the program yet you can create it or just modify `default.config.json`.

`PUSHBULLET` - Contains parameters for pushbullet integration. See [Notifications](#notifications).

`PLAY_SOUND` - A path to a `mp3`-file to be played when character selection screen is shown. Can be an absolute-path, or relative to the project. If empty or `false`, no sound is played.

`CHECK_INTERVAL` - Time in `ms` between every screenshot and queue-check. Default: 30000 (30 sec).

`UPDATE_INTERVAL` - Time in `ms` between every position notification update. Default: 180000 (30min).

`POSITION_THRESHOLD` - Queue position threshold for sending a notification regardless of `UPDATE_INTERVAL`. If your position is lower than this, a notifcation is sent. Default: 200

### CLI options

#### --dry

Do a dry-run, which 'simulates' queue completion. Use this to test notifications-setup and get sample images of each monitor. Note that the volume may be loud!

#### --mute, -m

Do not play a sound when queue is complete.

#### --setup, -s,

Rerun first-time setup. E.g change PushBullet-device.

### --debug, -d

Sets log level to debug. Also outputs the processed image the OCR uses for recognition to `output.png`.

## Limitations

-   Lost Ark should preferebly be running in `windowed` or `borderless` windowed mode.
    The screencapture does not work if running in Fullscreen and the window is minmized. This is due to the render-loop being paused, and there's no way around that.

-   There has been very limited testing. I created this for myself, based on code I wrote for the same purpose for WoW Classic release. I have not tested on different monitors, resolutions or other versions than Windows 10. Please raise an issue if you face bugs.

-   Character/roster wallpapers may have an effect on the matching when logged in. I've only tested on the default and founder-pack one.

-   The client must be english. Support for other languages should be possible, but I need screenshots (and the words in text-form) for both queue-screen and character select screen.

-   I'm using [edge-js](https://www.npmjs.com/package/edge-js) to be able to run C#-code that takes the actual screenshot. This requires `.Net framework` - most Windows installations hopefully has this already, but it can be downloaded from here if you face issues: https://www.microsoft.com/en-us/download/details.aspx?id=30653
