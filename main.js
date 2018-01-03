﻿'use strict';
const path = require('path');
const fs = require('fs');
const isAdmin = require('is-admin');
const electron = require('electron');
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const setMenu = require('./set_menu');
const proxy = require('./proxy');
const registerProxy = require('./registry');

// Module to control application life.
const app = electron.app;

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;
const debug = /--debug/.test(process.argv[2]);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;
const settingsFilePath = path.resolve(app.getPath('userData'), 'settings.json');

// mock 设置，默认为空数组
global.mockSettings = [];

process.on('uncaughtException', err => {
    console.error(err);
    mainWindow.webContents.send('log', {
        type: 'error',
        message: `uncaughtException: ${err.message}`
    });
});

function initialize() {
    const shouldQuit = makeSingleInstance();
    if (shouldQuit) {
        return app.exit(0);
    }

    /**
     * 获取最新配置
     */
    function getLatestSettings() {
        return new Promise((resolve, reject) => {
            fs.readFile(settingsFilePath, (err, buffer) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        // 如果文件不存在，不认为是异常，返回空数组
                        resolve([]);
                    } else {
                        // 其他错误
                        reject(err);
                    }
                } else {
                    try {
                        const data = JSON.parse(buffer.toString());
                        resolve(data);
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        });
    }

    function createWindow() {
        const windowOptions = {
            width: 700,
            minWidth: 500,
            height: 840,
            icon: path.join(__dirname, `${process.platform === 'win32' ? '/static/image/mock.ico' : '/static/image/mock.png'}`),
            show: false
        };

        // Create the browser window.
        mainWindow = new BrowserWindow(windowOptions);

        // and load the index.html of the app.
        mainWindow.loadURL(path.join('file://', __dirname, '/index.html'));

        if (debug) {
            mainWindow.webContents.openDevTools();
            mainWindow.maximize();
        }

        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
        });

        // Emitted when the window is closed.
        mainWindow.on('closed', () => {
            // Dereference the window object, usually you would store windows
            // in an array if your app supports multi windows, this is the time
            // when you should delete the corresponding element.
            mainWindow = null;
        });
    }

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    app.on('ready', () => {
        // 检查是否是管理员用户
        isAdmin().then(admin => {
            if (!admin) {
                dialog.showMessageBox({
                    type: 'info',
                    buttons: [],
                    title: '说明',
                    message: '请以Windows管理员身份运行Mock！'
                });
                app.exit();
                return;
            }

            // 更新mock配置
            getLatestSettings().then(data => {
                global.mockSettings = data;
            });

            // 界面修改后，自动更新
            ipc.on('settingsModified', () => {
                getLatestSettings().then(data => {
                    global.mockSettings = data;
                });
            });

            // 创建UI
            createWindow();

            // 设置菜单
            setMenu();

            // 创建代理服务器
            proxy.init(mainWindow);

            // 注册代理信息
            registerProxy(mainWindow);
        });
    });

    // Quit when all windows are closed.
    app.on('window-all-closed', () => {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('activate', () => {
        if (mainWindow === null) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });

    app.on('before-quit', e => {
        e.preventDefault();
        global.mockSettings = null;
        proxy.close();
        registerProxy(mainWindow, false);
        app.exit();
    });

    app.setAsDefaultProtocolClient('mock');

    // 外部链接 mock://xxx 打开，备用
    app.on('open-url', (event, url) => {
        dialog.showMessageBox('Welcome Back', `You arrived from: ${url}`);
    });
}

function makeSingleInstance() {
    return app.makeSingleInstance(() => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

initialize();
