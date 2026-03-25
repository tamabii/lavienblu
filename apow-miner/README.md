# APoW AGENT Token Miner

Mine AGENT tokens on Base L2 using Agent Proof-of-Work protocol.

## Setup

1. **Install dependencies:**
```bash
npm install -g apow-cli
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your keys
```

3. **Generate wallet (if needed):**
```bash
npx apow-cli wallet new
```

4. **Fund wallet:**
- Send 0.01+ ETH to your wallet address on Base
- Or use: `npx apow-cli fund`

5. **Mint Mining Rig:**
```bash
npx apow-cli mint
```

6. **Start mining:**
```bash
npx apow-cli mine
```

## Files

- `.env.example` - Configuration template
- `.gitignore` - Excludes sensitive files

## Security

⚠️ Never share your private key or seed phrase!
