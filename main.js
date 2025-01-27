import fs from 'fs/promises';
import log from './utils/logger.js';
import { readFile, delay } from './utils/helper.js';
import banner from './utils/banner.js';
import LayerEdge from './utils/socket.js';
import { autoRegister } from './autoref.js';

// Function to read wallets 
async function readWallets() {
    try {
        await fs.access("wallets.json");
        const data = await fs.readFile("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

// 处理单个钱包的函数
async function processWallet(wallet, proxy) {
    const { address, privateKey } = wallet;
    try {
        const socket = new LayerEdge(proxy, privateKey);
        log.info(`Processing Wallet Address: ${address} with proxy:`, proxy);
        log.info(`Checking Node Status for: ${address}`);
        const isRunning = await socket.checkNodeStatus();

        if (isRunning) {
            log.info(`Wallet ${address} is running - trying to claim node points...`);
            await socket.stopNode();
        }
        log.info(`Trying to reconnect node for Wallet: ${address}`);
        await socket.connectNode();

        log.info(`Checking Node Points for Wallet: ${address}`);
        await socket.checkNodePoints();
    } catch (error) {
        log.error(`Error Processing wallet:`, error.message);
    }
}

// 并发处理钱包的函数，使用并发池
async function processWalletsConcurrently(wallets, proxies, concurrency) {
    const tasks = [];
    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const proxy = proxies[i % proxies.length] || null;
        const task = processWallet(wallet, proxy);
        tasks.push(task);
        if (tasks.length >= concurrency) {
            await Promise.allSettled(tasks);
            tasks.length = 0;
        }
    }
    if (tasks.length > 0) {
        await Promise.allSettled(tasks);
    }
}

async function run() {
    log.info(banner);
    await delay(3);

    const proxies = await readFile('proxy.txt');
    let wallets = await readWallets();
    if (proxies.length === 0) log.warn("No proxies found in proxy.txt - running without proxies");
    if (wallets.length === 0) {
        log.info('No Wallets found, creating new Wallets first "npm run autoref"');
        return;
    }

    log.info('Starting run Program with all Wallets:', wallets.length);

    const concurrency = 10; // 并发数量，可以根据实际情况调整

    while (true) {
        await processWalletsConcurrently(wallets, proxies, concurrency);
        log.warn(`All Wallets have been processed, waiting 1 hours before next run...`);
        await autoRegister();
        await delay(60 * 60);
    }
}

run();
