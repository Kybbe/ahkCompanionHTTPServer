const { app, Menu, Tray } = require("electron");
const path = require("path");
const { fork } = require("child_process");

let tray = null;
let serverProcess = null;

function startServer() {
    // Start your ahkCompanionServer.js as a child process
    serverProcess = fork(path.join(__dirname, "ahkCompanionServer.js"));
    console.log("Server started");
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
        console.log("Server stopped");
    }
}

app.on("ready", () => {
    tray = new Tray(path.join(__dirname, "icon.png")); // use a .png or .ico

    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Restart Server",
            click: () => {
                stopServer();
                startServer();
            },
        },
        {
            label: "Exit",
            click: () => {
                stopServer();
                app.quit();
            },
        },
    ]);

    tray.setToolTip("AHK Companion Server");
    tray.setContextMenu(contextMenu);

    startServer();
});

app.on("before-quit", () => {
    stopServer();
});
