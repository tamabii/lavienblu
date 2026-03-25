# 🤖 LavienBlu - AI Mining Automation

AI-powered cryptocurrency mining automation for MineLoot and APoW protocols on Base L2.

## 📁 Projects

### 1. [apow-miner](./apow-miner) - APoW AGENT Token Mining
- Mine AGENT tokens using Agent Proof-of-Work protocol
- Requires LLM for minting, algorithmic mining after
- Auto-setup and 24/7 mining capability

### 2. [mineloot-agent](./mineloot-agent) - MineLoot ETH Mining
- Direct blockchain mining on MineLoot grid
- No MetaMask UI needed - pure code
- Deploy ETH to 25 blocks automatically

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- Base ETH for gas fees
- (Optional) LLM API key for APoW minting

### Setup APoW
```bash
cd apow-miner
cp .env.example .env
# Edit .env with your keys
npm install
npx apow-cli setup
npx apow-cli mine
```

### Setup MineLoot
```bash
cd mineloot-agent
cp .env.example .env
# Edit .env with your keys
npm install
node miner_direct.js
```

## 🔐 Security

**IMPORTANT:** Never commit real private keys!
- Use `.env.example` as template
- Real `.env` files are gitignored
- Wallet files are auto-generated locally

## 📄 License

MIT - Use at your own risk. DYOR.
