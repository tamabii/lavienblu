const { ethers } = require('ethers');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

// ===== CONFIGURATION =====
const CONFIG = {
  // Network: Base Mainnet
  BASE_RPC: process.env.BASE_RPC || 'https://mainnet.base.org',
  
  // Wallet
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  WALLET_ADDRESS: process.env.WALLET_ADDRESS,
  
  // MineLoot Contracts
  GRID_MINING: '0xA8E2F506aDcbBF18733A9F0f32e3D70b1A34d723',
  AUTO_MINER: '0x4b99Ebe4F9220Bd5206199b10dFC039a6a73eDBC',
  LOOT_TOKEN: '0x00E701Eff4f9Dc647f1510f835C5d1ee7E41D28f',
  
  // Mining Config
  TOTAL_DEPLOY_ETH: '0.00025',      // 0.00025 ETH total
  BLOCKS_COUNT: 25,                 // Deploy to all 25 blocks
  ETH_PER_BLOCK: '0.00001',         // 0.00001 ETH per block
  STRATEGY: 'all',                  // 'all' = all 25 blocks
  
  // Timing
  ROUND_DURATION: 60,               // Seconds per round
  AUTO_CLAIM_ETH: true,             // Auto claim ETH rewards
  AUTO_CLAIM_LOOT: false,           // Auto claim LOOT (false = hold for forging bonus)
  
  // Reporting
  REPORT_FILE: '/root/.openclaw/workspace/mineloot-latest-report.txt',
};

// ===== CONTRACT ABIs =====
const GRID_MINING_ABI = [
  "function deploy(uint8[] calldata blockIds) external payable",
  "function claimETH() external",
  "function claimLOOT() external",
  "function getCurrentRoundInfo() view returns (uint64 roundId, uint256 startTime, uint256 endTime, uint256 totalDeployed, uint256 timeRemaining, bool isActive)",
  "function getTotalPendingRewards(address) view returns (uint256 pendingETH, uint256 unforgedLOOT, uint256 forgedLOOT, uint64 uncheckpointedRound)",
  "function currentRoundId() view returns (uint64)",
  "function lootpotPool() view returns (uint256)",
  "event Deployed(uint64 indexed roundId, address indexed user, uint256 totalAmount, uint8[] blockIds)",
  "event ETHClaimed(address indexed user, uint256 amount)",
  "event LOOTClaimed(address indexed user, uint256 minedLoot, uint256 forgedBonus, uint256 fee)"
];

const AUTO_MINER_ABI = [
  "function setConfig(uint8 strategyId, uint256 numRounds, uint8 numBlocks, uint32 blockMask) external payable",
  "function stop() external",
  "function getUserState(address) view returns (tuple(uint8 strategy, uint32 blockMask, uint8 numBlocks, uint256 ethPerRound, uint256 roundsRemaining, bool active) config, uint256 roundsExecuted, uint256 costPerRound, uint256 refundableETH)",
  "event ConfigSet(address indexed user, uint8 strategyId, uint256 numRounds, uint256 totalDeposit)"
];

// ===== LOGGER =====
class Logger {
  static log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };
    
    console.log(`[${timestamp}] [${level}] ${message}`);
    if (Object.keys(data).length > 0) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
    
    return logEntry;
  }
  
  static info(msg, data) { return this.log('INFO', msg, data); }
  static success(msg, data) { return this.log('SUCCESS', msg, data); }
  static error(msg, data) { return this.log('ERROR', msg, data); }
  static warn(msg, data) { return this.log('WARN', msg, data); }
}

// ===== MINELOOT MINER =====
class MineLootMiner {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
    this.wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider);
    this.gridMining = new ethers.Contract(CONFIG.GRID_MINING, GRID_MINING_ABI, this.wallet);
    this.autoMiner = new ethers.Contract(CONFIG.AUTO_MINER, AUTO_MINER_ABI, this.wallet);
    this.reports = [];
    this.isRunning = false;
  }

  async initialize() {
    Logger.info('Initializing MineLoot Miner...', {
      wallet: this.wallet.address,
      balance: ethers.formatEther(await this.provider.getBalance(this.wallet.address)) + ' ETH'
    });
    
    // Get current gas price
    this.baseFee = (await this.provider.getFeeData()).maxFeePerGas;
    Logger.info('Network status', {
      baseFee: ethers.formatUnits(this.baseFee || 0n, 'gwei') + ' gwei'
    });
    
    return true;
  }

  async getRoundInfo() {
    try {
      const info = await this.gridMining.getCurrentRoundInfo();
      return {
        roundId: info.roundId.toString(),
        startTime: new Date(Number(info.startTime) * 1000).toISOString(),
        endTime: new Date(Number(info.endTime) * 1000).toISOString(),
        totalDeployed: ethers.formatEther(info.totalDeployed),
        timeRemaining: Number(info.timeRemaining),
        isActive: info.isActive
      };
    } catch (error) {
      Logger.error('Failed to get round info', { error: error.message });
      return null;
    }
  }

  async getRewards() {
    try {
      const rewards = await this.gridMining.getTotalPendingRewards(this.wallet.address);
      return {
        pendingETH: ethers.formatEther(rewards.pendingETH),
        unforgedLOOT: ethers.formatEther(rewards.unforgedLOOT),
        forgedLOOT: ethers.formatEther(rewards.forgedLOOT),
        uncheckpointedRound: rewards.uncheckpointedRound.toString()
      };
    } catch (error) {
      Logger.error('Failed to get rewards', { error: error.message });
      return null;
    }
  }

  async deployAllBlocks() {
    try {
      // Create array of all 25 blocks (0-24)
      const blockIds = Array.from({ length: 25 }, (_, i) => i);
      const valuePerBlock = ethers.parseEther(CONFIG.ETH_PER_BLOCK);
      const totalValue = valuePerBlock * BigInt(25);
      
      Logger.info('Deploying to all 25 blocks...', {
        blocks: blockIds.length,
        ethPerBlock: CONFIG.ETH_PER_BLOCK,
        totalETH: ethers.formatEther(totalValue)
      });

      // Get current round first
      const roundInfo = await this.getRoundInfo();
      
      // Send deploy transaction
      const tx = await this.gridMining.deploy(blockIds, {
        value: totalValue,
        maxFeePerGas: this.baseFee,
        maxPriorityFeePerGas: ethers.parseUnits('0.001', 'gwei')
      });
      
      Logger.info('Transaction sent', { hash: tx.hash });
      
      const receipt = await tx.wait();
      Logger.success('Deployment confirmed!', {
        hash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: ethers.formatUnits(receipt.effectiveGasPrice, 'gwei') + ' gwei',
        cost: ethers.formatEther(receipt.gasUsed * receipt.effectiveGasPrice) + ' ETH'
      });
      
      // Save report
      this.addReport({
        type: 'DEPLOY',
        roundId: roundInfo.roundId,
        txHash: tx.hash,
        blocks: 25,
        ethDeployed: ethers.formatEther(totalValue),
        gasCost: ethers.formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      Logger.error('Deployment failed', { error: error.message });
      return false;
    }
  }

  async claimETH() {
    try {
      const rewards = await this.getRewards();
      const pendingETH = parseFloat(rewards.pendingETH);
      
      if (pendingETH < 0.00001) {
        Logger.info('ETH rewards too small to claim', { pending: pendingETH });
        return false;
      }
      
      Logger.info('Claiming ETH rewards...', { amount: pendingETH });
      
      const tx = await this.gridMining.claimETH({
        maxFeePerGas: this.baseFee,
        maxPriorityFeePerGas: ethers.parseUnits('0.001', 'gwei')
      });
      
      const receipt = await tx.wait();
      Logger.success('ETH claimed!', { hash: tx.hash, amount: pendingETH });
      
      this.addReport({
        type: 'CLAIM_ETH',
        txHash: tx.hash,
        amount: pendingETH,
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      Logger.error('ETH claim failed', { error: error.message });
      return false;
    }
  }

  async runSingleRound() {
    try {
      const roundInfo = await this.getRoundInfo();
      if (!roundInfo) return;
      
      Logger.info('Current round status', roundInfo);
      
      // Wait if round just started
      if (roundInfo.timeRemaining > 50) {
        const waitTime = roundInfo.timeRemaining - 50;
        Logger.info(`Waiting ${waitTime}s before deploying...`);
        await new Promise(r => setTimeout(r, waitTime * 1000));
      }
      
      // Deploy
      await this.deployAllBlocks();
      
      // Wait for round to end
      Logger.info('Waiting for round settlement...');
      await new Promise(r => setTimeout(r, 65000)); // Wait ~65s
      
      // Claim rewards if enabled
      if (CONFIG.AUTO_CLAIM_ETH) {
        await this.claimETH();
      }
      
      // Get final rewards
      const rewards = await this.getRewards();
      Logger.info('Rewards after round', rewards);
      
      // Save report
      this.saveReport();
      
    } catch (error) {
      Logger.error('Round execution failed', { error: error.message });
    }
  }

  async runContinuous() {
    Logger.info('Starting continuous mining...');
    this.isRunning = true;
    
    while (this.isRunning) {
      try {
        await this.runSingleRound();
        Logger.info('Waiting 5s before next round...');
        await new Promise(r => setTimeout(r, 5000));
      } catch (error) {
        Logger.error('Mining loop error', { error: error.message });
        await new Promise(r => setTimeout(r, 10000)); // Wait 10s on error
      }
    }
  }

  addReport(data) {
    this.reports.push(data);
    if (this.reports.length > 100) {
      this.reports.shift(); // Keep last 100
    }
  }

  saveReport() {
    try {
      const report = {
        generatedAt: new Date().toISOString(),
        wallet: this.wallet.address,
        totalRounds: this.reports.filter(r => r.type === 'DEPLOY').length,
        totalETHDeployed: this.reports
          .filter(r => r.type === 'DEPLOY')
          .reduce((sum, r) => sum + parseFloat(r.ethDeployed), 0)
          .toFixed(6),
        totalGasCost: this.reports
          .filter(r => r.ethDeployed)
          .reduce((sum, r) => sum + parseFloat(r.gasCost || 0), 0)
          .toFixed(6),
        recentActivity: this.reports.slice(-10)
      };
      
      fs.writeFileSync(CONFIG.REPORT_FILE, JSON.stringify(report, null, 2));
      Logger.success('Report saved', { file: CONFIG.REPORT_FILE });
    } catch (error) {
      Logger.error('Failed to save report', { error: error.message });
    }
  }

  stop() {
    this.isRunning = false;
    Logger.info('Mining stopped by user');
  }
}

// ===== MAIN =====
async function main() {
  console.log('🚀 MineLoot Auto-Miner v1.0');
  console.log('============================\n');
  
  // Check config
  if (!CONFIG.PRIVATE_KEY || !CONFIG.WALLET_ADDRESS) {
    console.error('❌ ERROR: Please set PRIVATE_KEY and WALLET_ADDRESS in .env file');
    console.log('\n📄 Create .env file with:');
    console.log('  PRIVATE_KEY=your_private_key_here');
    console.log('  WALLET_ADDRESS=your_wallet_address_here');
    console.log('  BASE_RPC=https://mainnet.base.org');
    process.exit(1);
  }
  
  const miner = new MineLootMiner();
  await miner.initialize();
  
  // Start mining
  await miner.runContinuous();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  process.exit(0);
});

main().catch(console.error);
