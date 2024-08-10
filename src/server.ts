import http from "http";
import os from "os";
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import * as pty from "node-pty";
import cors from "cors";
const dirTree = require("directory-tree");
const chokidar = require("chokidar");
const fs = require("fs");

const shell = os.platform() === "win32" ? "powershell.exe" : "bash"

const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.INIT_CWD + "/user",
    env: process.env
})

const app = express();

app.use(cors());
const server = http.createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: '*',
    }
})

ptyProcess.onData(data => {
    io.emit("terminal:data", data)
})

chokidar.watch('./user').on('all', (event: any, path: any) => {
    io.emit("file:refresh", path);
});

io.on("connection", (socket) => {
    console.log("Socket connected successfully: ", socket.id);
    socket.on("terminal:write", (data) => {
        ptyProcess.write(data)
    })
    socket.on("file:selected", (path) => {
        fs.readFile(path, "utf8", (err: any, data: string) => {
            if (err) {
                console.error(err);
                io.emit("file:read", { path, data: null });
            } else {
                io.emit("file:read", { path, data });
            }
        })
    })

    socket.on("file:write", (data) => {
        fs.writeFile(data.path, data.data, (err: any) => {
            if (err) {
                console.error(err);
            }
        })
    })
})

server.listen(9000, () => console.log("Docker server listening on port 9000"));

app.get("/files", async (req, res) => {
    const fileTree = dirTree(process.env.INIT_CWD + "/user");
    res.json({ tree: convertToUsableFormat(fileTree) });
})

function convertToUsableFormat(node: Record<string, any>): Record<string, any> {
    return {
        name: node.name,
        toggled: false,
        children: node.children ? node.children.map(convertToUsableFormat) : null
    };
}