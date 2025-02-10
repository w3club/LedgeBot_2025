import axios from "axios";
import chalk from "chalk";
import { Wallet } from "ethers";
import log from "./logger.js";
import { newAgent } from "./helper.js";

// Helper Functions
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms * 1000));
}

class RequestHandler {
  static async makeRequest(config, retries = 30, backoffMs = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        log.info(
          `Attempting request (${i + 1}/${retries})`,
          `URL: ${config.url}`
        );
        const response = await axios(config);
        log.info(`Request successful`, `Status: ${response.status}`);
        return response;
      } catch (error) {
        console.log(error, "error");

        const isLastRetry = i === retries - 1;
        const status = error.response?.status;

        // Special handling for 500 errors
        if (status === 500) {
          log.error(`Server Error (500)`, `Attempt ${i + 1}/${retries}`, error);
          if (isLastRetry) break;

          // Exponential backoff for 500 errors
          const waitTime = backoffMs * Math.pow(1.5, i);
          log.warn(`Waiting ${waitTime / 1000}s before retry...`);
          await delay(waitTime / 1000);
          continue;
        }

        if (isLastRetry) {
          log.error(`Max retries reached`, "", error);
          return null;
        }

        log.warn(`Request failed`, `Attempt ${i + 1}/${retries}`, error);
        await delay(2);
      }
    }
    return null;
  }
}

class LayerEdgeConnection {
  constructor(proxy = null, privateKey = null, refCode = "RSYJNQjI") {
    this.refCode = refCode;
    this.proxy = proxy;

    // Browser-like headers
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://layeredge.io",
      Referer: "https://layeredge.io/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "sec-ch-ua":
        '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    };

    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
      timeout: 60000,
      headers: this.headers,
      validateStatus: (status) => {
        return status < 500;
      },
    };
    this.wallet = privateKey ? new Wallet(privateKey) : Wallet.createRandom();
  }

  getWallet() {
    return this.wallet;
  }

  async makeRequest(method, url, config = {}) {
    const finalConfig = {
      method,
      url,
      ...this.axiosConfig,
      ...config,
      headers: {
        ...this.headers,
        ...(config.headers || {}),
      },
    };

    return await RequestHandler.makeRequest(finalConfig, this.retryCount);
  }

  async dailyCheckIn() {
        const timestamp = Date.now();
        const message = `Daily check-in request for ${this.wallet.address} at ${timestamp}`;
        const sign = await this.wallet.signMessage(message);

        const dataSign = {
            sign: sign,
            timestamp: timestamp,
            walletAddress: this.wallet.address
        };

        const response = await this.makeRequest(
            "post",
            "https://referralapi.layeredge.io/api/light-node/claim-node-points",
            { data: dataSign }
        );

        if (response && response.data) {
            log.info("Daily Check in Result:", response.data);
            return true;
        } else {
            log.error("Failed to perform daily check-in");
            return false;
        }
    }

  async checkInvite() {
    const inviteData = {
      invite_code: this.refCode,
    };

    const response = await this.makeRequest(
      "post",
      "https://referralapi.layeredge.io/api/referral/verify-referral-code",
      { data: inviteData }
    );

    if (response && response.data && response.data.data.valid === true) {
      log.info("Invite Code Valid", response.data);
      return true;
    } else {
      log.error("Failed to check invite");
      return false;
    }
  }

  async registerWallet() {
    const registerData = {
      walletAddress: this.wallet.address,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/referral/register-wallet/${this.refCode}`,
      { data: registerData }
    );

    if (response && response.data) {
      log.info("Wallet successfully registered", response.data);
      return true;
    } else {
      log.error("Failed To Register wallets", "error");
      return false;
    }
  }

  async connectNode() {
    const timestamp = Date.now();
    const message = `Node activation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);

    const dataSign = {
      sign: sign,
      timestamp: timestamp,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/start`,
      { data: dataSign }
    );

    if (
      response &&
      response.data &&
      response.data.message === "node action executed successfully"
    ) {
      log.info("Connected Node Successfully", response.data);
      return true;
    } else {
      log.info("Failed to connect Node");
      return false;
    }
  }
  async stopNode() {
    const timestamp = Date.now();
    const message = `Node deactivation request for ${this.wallet.address} at ${timestamp}`;
    const sign = await this.wallet.signMessage(message);

    const dataSign = {
      sign: sign,
      timestamp: timestamp,
    };

    const response = await this.makeRequest(
      "post",
      `https://referralapi.layeredge.io/api/light-node/node-action/${this.wallet.address}/stop`,
      { data: dataSign }
    );

    if (response && response.data) {
      log.info("Stop and Claim Points Result:", response.data);
      return true;
    } else {
      log.error("Failed to Stopping Node and claiming points");
      return false;
    }
  }

  async checkNodeStatus() {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/light-node/node-status/${this.wallet.address}`
    );

    if (
      response &&
      response.data &&
      response.data.data.startTimestamp !== null
    ) {
      log.info("Node Status Running", response.data);
      return true;
    } else {
      log.error("Node not running trying to start node...");
      return false;
    }
  }

  async checkNodePoints() {
    const response = await this.makeRequest(
      "get",
      `https://referralapi.layeredge.io/api/referral/wallet-details/${this.wallet.address}`
    );

    if (response && response.data) {
      log.info(
        `${this.wallet.address} Total Points:`,
        response.data.data?.nodePoints || 0
      );
      return true;
    } else {
      log.error("Failed to check Total Points..");
      return false;
    }
  }
}

export default LayerEdgeConnection;
