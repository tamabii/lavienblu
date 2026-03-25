const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

// ===== MINELOOT AUTO MINER =====
// Direct blockchain interaction - no MetaMask UI needed

const CONFIG = {
  // Network
  RPC_URL: process.env.BASE_RPC || 'https://mainnet.base.org',
  
  // Wallet (user provides private key)
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  
  // Contracts
  GRID_MINING: '0xA8E2F506aDcbBF18733A9F0f32e3D70b1A34d723',
  LOOT_TOKEN: '0x00E701Eff4f9Dc647f1510f835C5d1ee7E41D28f',
  
  // Mining Config
  DEPLOY_ETH: '0.00025',      // Total 0.00025 ETH
  BLOCKS: 25,                 // Deploy to all 25 blocks
  ETH_PER_BLOCK: '0.00001',   // 0.00001 per block
  
  // Timing
  ROUND_DURATION: 60,         // 60 seconds per round
  
  // Reporting
  REPORT_FILE: '/root/.openclaw/workspace/mineloot-latest-report.txt',
};

const ABI = [
  "function deploy(uint8[] calldata blockIds) external payable",
  "function claimETH() external",
  "function claimLOOT() external",
  "function getCurrentRoundInfo() view returns (uint64 roundId, uint256 startTime, uint256 endTime, uint256 totalDeployed, uint256 timeRemaining, bool isActive)",
  "function getTotalPendingRewards(address) view returns (uint256 pendingETH, uint256 unforgedLOOT, uint256 forgedLOOT, uint64 uncheckpointedRound)",
  "function currentRoundId() view returns (uint64)",
  "function lootpotPool() view returns (uint256)"
];

class MineLootBot {
  constructor() {
    if (!CONFIG.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not set! Export it: export PRIVATE_KEY=0x...');
    }
    
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    this.wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(CONFIG.GRID_MINING, ABI, this.wallet);
    this.running = false;
    this.stats = {
      roundsMined: 0,
      totalETHDeployed: 0,
      totalGasSpent: 0,
      startTime: Date.now()
    };
  }

  log(msg, data = {}) {
    const time = new Date().toISOString();
    console.log(`[${time}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
  }

  async getBalance() {
    const bal = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(bal);
  }

  async getRoundInfo() {
    try {
      const info = await this.contract.getCurrentRoundInfo();
      return {
        roundId: info.roundId.toString(),
        timeRemaining: Number(info.timeRemaining),
        isActive: info.isActive,
        totalDeployed: ethers.formatEther(info.totalDeployed)
      };
    } catch (e) {
      this.log('Error getting round info:', { error: e.message });
      return null;
    }
  }

  async getRewards() {
    try {
      const rewards = await this.contract.getTotalPendingRewards(this.wallet.address);
      return {
        eth: ethers.formatEther(rewards.pendingETH),
        loot: ethers.formatEther(rewards.unforgedLOOT)
      };
    } catch (e) {
      return { eth: '0', loot: '0' };
    }
  }

  async mineRound() {
    const blockIds = Array.from({ length: 25 }, (_, i) => i);
    const value = ethers.parseEther(CONFIG.ETH_PER_BLOCK) * BigInt(25);
    
    this.log(`⛏️  Mining round...`, {
      blocks: 25,
      eth: ethers.formatEther(value)
    });

    try {
      const tx = await this.contract.deploy(blockIds, {
        value,
        maxFeePerGas: ethers.parseUnits('0.1', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.001', 'gwei')
      });

      this.log(`📤 Transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      
      this.stats.roundsMined++;
      this.stats.totalETHDeployed += parseFloat(ethers.formatEther(value));
      this.stats.totalGasSpent += parseFloat(ethers.formatEther(gasCost));

      this.log(`✅ Mined!`, {
        gasUsed: receipt.gasUsed.toString(),
        gasCost: ethers.formatEther(gasCost)
      });

      return true;
    } catch (e) {
      this.log(`❌ Mining failed: ${e.message}`);
      return false;
    }
  }

  async claimRewards() {
    const rewards = await this.getRewards();
    
    if (parseFloat(rewards.eth) > 0.001) {
      try {
        this.log('💰 Claiming ETH...', { amount: rewards.eth });
        const tx = await this.contract.claimETH();
        await tx.wait();
        this.log('✅ ETH claimed');
      } catch (e) {
        this.log('❌ Claim failed:', { error: e.message });
      }
    }
  }

  saveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      wallet: this.wallet.address,
      balance: this.stats.balance,
      stats: this.stats,
      rewards: this.stats.rewards,
      runtime: Math.floor((Date.now() - this.stats.startTime) / 1000)
    };
    fs.writeFileSync(CONFIG.REPORT_FILE, JSON.stringify(report, null, 2));
  }

  async run() {
    this.log('🚀 MineLoot Auto-Miner Starting...');
    this.log(`💳 Wallet: ${this.wallet.address}`);
    
    const balance = await this.getBalance();
    this.log(`💰 Balance: ${balance} ETH`);
    
    if (parseFloat(balance) < 0.001) {
      this.log('❌ Insufficient balance! Need at least 0.001 ETH');
      return;
    }

    this.running = true;

    while (this.running) {
      try {
        const round = await this.getRoundInfo();
        if (!round) {
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        this.log(`📊 Round ${round.roundId}`, {
          timeLeft: round.timeRemaining,
          pool: round.totalDeployed
        });

        // Mine if round is active and time left > 10s
        if (round.isActive && round.timeRemaining > 10) {
          await this.mineRound();
          
          // Claim rewards periodically
          if (this.stats.roundsMined % 5 === 0) {
            await this.claimRewards();
          }
          
          // Update report
          this.stats.balance = await this.getBalance();
          this.stats.rewards = await this.getRewards();
          this.saveReport();
        }

        // Wait for next round
        const waitTime = Math.max(5, round.timeRemaining + 5);
        this.log(`⏳ Waiting ${waitTime}s for next round...`);
        await new Promise(r => setTimeout(r, waitTime * 1000));

      } catch (e) {
        this.log('❌ Error in main loop:', { error: e.message });
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  stop() {
    this.running = false;
    this.log('🛑 Stopping miner...');
    this.saveReport();
  }
}

// ===== MAIN =====
console.log('═══════════════════════════════════════════');
console.log('  MineLoot Auto-Miner v2.0');
console.log('  Direct Blockchain Mode (No MetaMask UI)');
console.log('═══════════════════════════════════════════\n');

try {
  const bot = new MineLootBot();
  
  process.on('SIGINT', () => {
    bot.stop();
    process.exit(0);
  });
  
  bot.run().catch(console.error);
} catch (e) {
  console.error('❌ Setup error:', e.message);
  console.log('\n📋 To use this bot:');
  console.log('  1. Create a wallet (MetaMask/Phantom/etc)');
  console.log('  2. Get private key from your wallet');
  console.log('  3. Export: export PRIVATE_KEY=0x...');
  console.log('  4. Run: node miner_direct.js');
  process.exit(1);
}
