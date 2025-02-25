
import fs from 'fs/promises'
import log from './utils/logger.js'
import { readFile, delay } from './utils/helper.js'
import banner from './utils/banner.js';
import LayerEdge from './utils/socket.js';
import { autoRegister } from './autoref.js'

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

    while (true) {
        const patchNumber = 100
        for (let i = 0; i < wallets.length; i += patchNumber) { // 每次处理10个钱包
            const batch = wallets.slice(i, i + patchNumber); // 获取当前批次的钱包
            const promises = batch.map(async (wallet) => { // 使用 Promise.all 处理批量请求
                const proxy = proxies[i % proxies.length] || null;
                const { address, privateKey } = wallet;
                try {
                    await delay(20); // 在每个请求之间等待20秒
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
            });
            await Promise.all(promises); // 等待当前批次的所有请求完成
            log.warn(`Processed batch of ${batch.length} wallets, waiting 1 minute before next batch...`);
            await delay(60); // 等待1分钟
        }
        log.warn(`All ${wallets.length} wallets have been processed, waiting 1 hours before next run...`);
        await autoRegister();
        await delay(60 * 60);
    }
}

run();
