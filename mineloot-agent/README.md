# 🚀 MineLoot Auto-Miner Setup

## Quick Start

### 1. Create Wallet (Choose one)

**Option A: MetaMask Extension (Manual)**
```bash
# Install MetaMask di Chrome/Firefox Anda
# Create wallet → Save seed phrase → Export private key
```

**Option B: Direct (Recommended)**
```bash
cd /root/mineloot-agent
node -e "const ethers=require('ethers');const w=ethers.Wallet.createRandom();console.log('Address:',w.address);console.log('PrivateKey:',w.privateKey);console.log('Mnemonic:',w.mnemonic.phrase);"
```

### 2. Set Environment
```bash
export PRIVATE_KEY=0x...your_private_key...
export BASE_RPC=https://mainnet.base.org
```

### 3. Run Miner
```bash
node miner_direct.js
```

## Files Structure

```
/root/mineloot-agent/
├── miner_direct.js      # ✅ Main mining bot (use this!)
├── auto_mine.js         # Alternative version
├── .env                 # Environment variables
└── metamask-extension/  # MetaMask (optional)
```

## Mining Config

- **Total Deploy**: 0.00025 ETH per round
- **Blocks**: 25 (all blocks)
- **Per Block**: 0.00001 ETH
- **Round Time**: ~60 seconds
- **Network**: Base Mainnet

## Important Notes

1. **NEVER share private key publicly**
2. **Minimum balance**: 0.001 ETH on Base
3. **Gas**: Paid in ETH on Base network
4. **Report**: Saved to workspace/mineloot-latest-report.txt

## Wallet Funding

Send Base ETH to your wallet address:
- Bridge from Ethereum: https://bridge.base.org
- Or buy directly on Base

## Commands

```bash
# Check balance
node -e "const e=require('ethers');const p=new e.JsonRpcProvider('https://mainnet.base.org');p.getBalance('YOUR_ADDRESS').then(b=>console.log(e.formatEther(b)))
"

# Run miner
node miner_direct.js

# View report
cat /root/.openclaw/workspace/mineloot-latest-report.txt
```
