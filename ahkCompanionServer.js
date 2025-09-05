// ahkCompanionServer.js
const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const SoundMixer = require("native-sound-mixer").default;
const mixer = require("native-sound-mixer");
const { DeviceType } = mixer;

const app = express();
app.use(express.json());

const AHK_PATH = "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe";
const AHK_DEFAULT_DIR = path.join(process.env.USERPROFILE, "Documents", "AutoHotkey");

app.post("/macro", (req, res) => {
    try {
        console.log("got macro call")
        const { script } = req.body;

        if (!script) return res.status(400).send("Missing script");

        const scriptPath = path.join(os.tmpdir(), `macro.ahk`);
        fs.writeFileSync(scriptPath, script);

        const ahk = spawn(AHK_PATH, [scriptPath]);

        ahk.on("exit", code => res.send(`Macro finished with code ${code}`));
        ahk.stderr.on("data", data => console.error(`AHK Error: ${data}`));
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send("Server error");
    }
});

app.post("/runFile", (req, res) => {
    console.log("got runFile call")
    try {
        const { file, directory } = req.body;

        if (!file) return res.status(400).send("Missing file name");

        const scriptPath = directory
            ? path.resolve(directory, file)
            : path.join(AHK_DEFAULT_DIR, file);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).send(`File not found: ${scriptPath}`);
        }

        const ahk = spawn(AHK_PATH, [scriptPath]);

        ahk.on("exit", code => res.send(`File finished with code ${code}`));
        ahk.stderr.on("data", data => console.error(`AHK Error: ${data}`));
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send("Server error");
    }
});

app.get("/audioSessions", (req, res) => {
    console.log("got audioSessions call")
    /* https://www.npmjs.com/package/native-sound-mixer */

    try {
        const devices = SoundMixer.devices;
        console.log(devices);

        const device = SoundMixer.getDefaultDevice(DeviceType.RENDER);
        console.log(device);

        const sessions = device.sessions;
        const session = sessions[0]; // get the first session for testing
        console.log(sessions);
        console.log(session);

        // retrieving the mute flag 
        const isDeviceMuted = device.mute; // bool
        console.log(isDeviceMuted);

        /* // toggling mute
        device.mute = !isDeviceMuted; */

        // retrieving the volume 
        const deviceVolume = device.volume;
        console.log(deviceVolume);

        /* // adding 10% to volume
        device.volume += .1; */

        // set session to a valid session object
        const isSessionMuted = session.mute;
        console.log(isSessionMuted);
        // toggling mute 
        /* session.mute = !isSessionMuted; */

        // set session to a valid session object
        const sessionVolume = session.volume;
        console.log(sessionVolume);
        // adding 10% to volume
        /* session.volume += .1; */

        res.json({ devices, device, sessions, isDeviceMuted, deviceVolume, isSessionMuted, sessionVolume });
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send("Server error");
    }
});

app.listen(8090, "127.0.0.1", () => {
    console.log("Server listening at http://127.0.0.1:8090");
});
