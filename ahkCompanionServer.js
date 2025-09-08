// ahkCompanionServer.js
const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const iconExtractor = require('icon-extractor');
const { windowManager } = require("node-window-manager");
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
        const { file, directory, args } = req.body;

        if (!file) return res.status(400).send("Missing file name");

        const scriptPath = directory
            ? path.resolve(directory, file)
            : path.join(AHK_DEFAULT_DIR, file);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).send(`File not found: ${scriptPath}`);
        }

        // Ensure args is an array, default to toggle if nothing is passed
        const ahkArgs = Array.isArray(args) ? args : ["toggle"];

        const ahk = spawn(
            AHK_PATH,
            [scriptPath, ...ahkArgs],
        );

        ahk.on("exit", code => res.send(`File finished with code ${code}`));
        ahk.stderr.on("data", data => console.error(`AHK Error: ${data}`));
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send("Server error");
    }
});

const blacklistedSessions = ["parsecd", "steam"];

app.get("/audio", (req, res) => {
    console.log("got audio call")
    /* https://www.npmjs.com/package/native-sound-mixer */

    try {
        const device = SoundMixer.getDefaultDevice(DeviceType.RENDER);

        const sessions = device.sessions.filter((s) => s.name && !blacklistedSessions.includes(s.name.toLowerCase()));

        const mainAudioInPercent = String(Math.round(device.volume * 100)) + "%";
        const mainAudio = {
            volume: mainAudioInPercent,
            muted: device.mute
        }

        let sessionAudios = sessions.map((s) => {
            const splitted = s.appName ? s.appName.split("\\") : [];
            const exeName = splitted.length ? splitted[splitted.length - 1] : "Unknown";

            const volumeInPercent = String(Math.round(s.volume * 100)) + "%";

            return {
                name: s.name,
                appName: s.appName,
                exeName: exeName,
                exeNameWithoutExe: exeName.split(".")[0],
                volume: volumeInPercent,
                muted: s.mute
            }
        });

        sessionAudios = sessionAudios.filter(s => s.name && !blacklistedSessions.includes(s.exeNameWithoutExe.toLowerCase()));

        //deduplicate by name, keeping the last
        const seen = new Set();
        sessionAudios = sessionAudios.filter(s => {
            if (seen.has(s.name)) {
                return false;
            }
            seen.add(s.name);
            return true;
        });

        res.json({ sessionAudios, mainAudio });
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

const getIcon = (exePath) => {
    return new Promise((resolve, reject) => {
        const listener = (icon) => {
            if (icon.Path === exePath) {
                console.log('Got correct icon for: ' + exePath);
                iconExtractor.emitter.removeListener('icon', listener);
                resolve(icon.Base64ImageData);
            }
        };

        iconExtractor.emitter.on('icon', listener);
        iconExtractor.getIcon(exePath, exePath);
    });
};

app.get("/sessionIcon", (req, res) => {
    console.log("got sessionIcon call")
    try {
        const { sessionName } = req.query;

        if (!sessionName) {
            return res.status(400).send("Missing sessionName parameter");
        }

        const device = SoundMixer.getDefaultDevice(DeviceType.RENDER);
        const session = device.sessions.find((s) => s.name === sessionName);

        if (!session) {
            return res.status(404).send(`Session not found: ${sessionName}`);
        }

        const iconPath = session.appName;
        console.log("Icon path:", iconPath);
        if (!iconPath || !fs.existsSync(iconPath)) {
            console.error("Icon path does not exist:", iconPath);
            return res.status(404).send("Icon not found");
        }


        /*  iconExtractor.emitter.on('icon', function(icon) {
             console.log('Here is my context: ' + icon.Context);
             console.log('Here is the path it was for: ' + icon.Path);
             console.log('Here is the base64 image: ' + icon.Base64ImageData);
 
             const iconAsBase64 = icon.Base64ImageData;
             const buffer = Buffer.from(iconAsBase64, 'base64');
             res.set('Content-Type', 'image/png');
             return res.send(buffer);
         });
 
         iconExtractor.getIcon(session.appName, iconPath); */

        getIcon(iconPath).then((iconAsBase64) => {
            const buffer = Buffer.from(iconAsBase64, 'base64');
            res.set('Content-Type', 'image/png');
            return res.send(buffer);
        }).catch((err) => {
            console.error("Error extracting icon:", err);
            return res.status(500).send("Error extracting icon");
        });
    } catch (e) {
        console.error("caught exception", e);
        return res.status(500).send(`Server error: ${e}`);
    }
});

app.post("/changeVolume", (req, res) => {
    console.log("got volume call")

    try {
        const { volume, sessionName, operation } = req.query;

        if (volume == null || volume < 0 || volume > 1) {
            return res.status(400).send("Invalid volume value. Must be between 0 and 1.");
        }

        const device = SoundMixer.getDefaultDevice(DeviceType.RENDER);

        if (sessionName) {
            const session = device.sessions.find((s) => s.name === sessionName);
            if (!session) {
                return res.status(404).send(`Session not found: ${sessionName}`);
            }
            if (operation === "increase") {
                console.log("increasing volume by", volume);
                session.volume += Number(volume);
            } else if (operation === "decrease") {
                console.log("decreasing volume by", volume);
                session.volume -= Number(volume);
            } else {
                console.log(`Set volume of session ${session.name} to ${volume}`);
                session.volume = Number(volume);
            }
        } else {
            // do device volume
            if (operation === "increase") {
                console.log("increasing device volume by", volume);
                device.volume += Number(volume);
            } else if (operation === "decrease") {
                console.log("decreasing device volume by", volume);
                device.volume -= Number(volume);
            } else {
                console.log(`Set device volume to ${volume}`);
                device.volume = Number(volume);
            }
        }

        res.send(`Volume set to ${volume}`);
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

app.post("/toggleMute", (req, res) => {
    console.log("got toggleMute call")

    try {
        const { sessionName } = req.query;

        const device = SoundMixer.getDefaultDevice(DeviceType.RENDER);

        if (sessionName) {
            const session = device.sessions.find((s) => s.name === sessionName);
            if (!session) {
                console.error("Session not found:", sessionName);
                return res.status(404).send(`Session not found: ${sessionName}`);
            }
            session.mute = !session.mute;
            console.log(`Toggled mute of session ${session.name} to ${session.mute}`);
        } else {
            device.mute = !device.mute;
            console.log(`Toggled device mute to ${device.mute}`);
        }

        res.send(`Mute toggled`);
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

const capitalize = (s) => {
    if (typeof s !== 'string') return '';
    const lowerCased = s.toLowerCase();
    return lowerCased.charAt(0).toUpperCase() + lowerCased.slice(1);
}

const customAppnameMappings = (window) => {
    const appNameFromPathFlat = window.appNameWithoutExe ? window.appNameWithoutExe.toLowerCase() : "";
    const appNameCapitalized = capitalize(appNameFromPathFlat);

    switch (appNameFromPathFlat) {
        case 'code': // VSCode
            const repoNameInTitle = window.title.split(" - ")[1];
            const isAnLXRepo = repoNameInTitle.includes("lx-");
            const repoName = isAnLXRepo ? capitalize(repoNameInTitle.replace("lx-", "")) : capitalize(repoNameInTitle);
            //if lx, remove lx- and return rest, else return code
            return repoName;
        case 'electron':
            return window.title
        default: return appNameCapitalized;
    }
};


app.get("/windows", (req, res) => {
    console.log("got windows call")
    try {
        const prioritizedApps = ["zen", "code", "slack", "spotify"];
        const blacklistedWindows = ["EdgeGameAssist", "XboxGameBarSpotify", "ShellExperienceHost", "SearchHost", "StartMenuExperienceHost", "TextInputHost", "ApplicationFrameHost", "SystemSettings"];
        const blacklistedWindowPaths = ["C:\\Windows\\SystemApps"];

        const activeWindow = windowManager.getActiveWindow();

        const windows = windowManager.getWindows().map(win => ({
            id: win.id,
            title: win.getTitle(),
            processId: win.processId,
            isVisible: win.isVisible(),
            isWindow: win.isWindow(),
            bounds: win.getBounds(),
            processPath: win.path,
            appName: win.path ? path.basename(win.path) : null,
            appNameWithoutExe: win.path ? path.basename(win.path).split(".")[0] : null,
            window: win.getMonitor(),
            active: activeWindow && win.id === activeWindow.id
        })).filter(win => win.isVisible && win.title.trim() !== "");

        let filteredWindows = windows.filter(win => {
            const appNameWithoutExe = win.appName ? win.appName.split(".")[0] : "";
            if (blacklistedWindows.includes(appNameWithoutExe)) {
                return false;
            }

            if (win.processPath) {
                for (const blacklistedPath of blacklistedWindowPaths) {
                    if (win.processPath.startsWith(blacklistedPath)) {
                        return false;
                    }
                }
            }
            return true;
        });

        filteredWindows = filteredWindows.map(win => ({
            ...win,
            customName: customAppnameMappings(win)
        })).sort((a, b) => {
            // sort so all of same app are together, then by title
            if (a.appNameWithoutExe < b.appNameWithoutExe) return -1;
            if (a.appNameWithoutExe > b.appNameWithoutExe) return 1;
            if (a.customName < b.customName) return -1;
            if (a.customName > b.customName) return 1;
            return 0;
        }).sort((a, b) => {
            // sort so prioritized apps come first
            const aPriority = prioritizedApps.indexOf(a.appNameWithoutExe ? a.appNameWithoutExe.toLowerCase() : "");
            const bPriority = prioritizedApps.indexOf(b.appNameWithoutExe ? b.appNameWithoutExe.toLowerCase() : "");
            if (aPriority === -1 && bPriority === -1) return 0;
            if (aPriority === -1) return 1;
            if (bPriority === -1) return -1;
            return aPriority - bPriority;
        });

        res.send(filteredWindows);
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

const getWindowById = (windowId) => {
    const win = windowManager.getWindows().find(w => String(w.id).toLocaleLowerCase() === String(windowId).toLocaleLowerCase());
    return win;
}

app.get("/windowIcon", (req, res) => {
    console.log("got windowIcon call")

    try {
        const { windowId } = req.query;
        if (!windowId) {
            return res.status(400).send("Missing windowId");
        }

        const win = getWindowById(windowId);
        if (!win) {
            return res.status(404).send("Window not found for id " + windowId);
        }

        const icon = win.getIcon(32);
        if (!icon) {
            console.log("No icon found from getIcon(), trying to extract from path");
            const iconPath = win.path;
            getIcon(iconPath).then((iconAsBase64) => {
                const buffer = Buffer.from(iconAsBase64, 'base64');
                console.log("Extracted icon from path:", iconPath);
                res.set('Content-Type', 'image/png');
                return res.send(buffer);
            }).catch((err) => {
                console.error("Error extracting icon:", err);
                return res.status(500).send("Error extracting icon");
            });
        } else {
            res.set('Content-Type', 'image/png');
            return res.send(icon);
        }
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

app.post("/focusWindow", (req, res) => {
    console.log("got focusWindow call")

    try {
        const { windowId } = req.query;
        if (!windowId) {
            return res.status(400).send("Missing windowId");
        }

        const win = getWindowById(windowId);
        if (!win) {
            return res.status(404).send("Window not found for id " + windowId);
        }

        win.show();
        win.bringToTop();
        res.send(`Window ${windowId} focused`);
    } catch (e) {
        console.error("caught exception", e);
        res.status(500).send(`Server error: ${e}`);
    }
});

app.listen(8090, "127.0.0.1", () => {
    console.log("Server listening at http://127.0.0.1:8090");
});
