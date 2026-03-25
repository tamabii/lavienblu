#!/bin/bash
# 🚀 MetaMask Agent Setup Script
# Run dengan: sudo bash setup-metamask.sh

set -e

echo "🚀 START SETUP META MASK AGENT..."

# Update & install dependencies
apt update && apt install -y curl wget unzip xvfb git sudo

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install Playwright dependencies
apt install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgtk-3-0

# Setup project directory
PROJECT_DIR="/root/metamask-agent"
mkdir -p $PROJECT_DIR && cd $PROJECT_DIR

# Init project
npm init -y
npm install playwright dotenv

# Install Chromium for Playwright
npx playwright install chromium

# Download MetaMask extension (stable version v11.15.5)
METAMASK_VERSION="11.15.5"
echo "📦 Downloading MetaMask v${METAMASK_VERSION}..."
wget -q "https://github.com/MetaMask/metamask-extension/releases/download/v${METAMASK_VERSION}/metamask-chrome-${METAMASK_VERSION}.zip" -O metamask.zip
unzip -q metamask.zip -d metamask-extension
rm metamask.zip

echo "✅ MetaMask extension downloaded"

# Create agent script
cat > agent.js << 'AGENTEOF'
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.join(__dirname, 'metamask-extension');
const USER_DATA_DIR = path.join(__dirname, 'user-data');

// Ensure user data dir exists
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupMetaMask() {
    console.log("🚀 Launching browser with MetaMask...");

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ],
        viewport: { width: 1280, height: 720 }
    });

    // Wait for MetaMask to load
    console.log("⏳ Waiting for MetaMask to initialize...");
    await delay(5000);

    // Find MetaMask page
    let metamaskPage = null;
    let attempts = 0;
    
    while (attempts < 30 && !metamaskPage) {
        const pages = context.pages();
        metamaskPage = pages.find(p => p.url().includes('chrome-extension') && p.url().includes('home'));
        
        if (!metamaskPage) {
            await delay(1000);
            attempts++;
            console.log(`  ⏳ Waiting... (${attempts}/30)`);
        }
    }

    if (!metamaskPage) {
        console.error("❌ MetaMask page not found");
        console.log("Available pages:");
        context.pages().forEach(p => console.log(`  - ${p.url()}`));
        await context.close();
        return;
    }

    console.log("🦊 MetaMask detected! Navigating to wallet creation...");
    await metamaskPage.bringToFront();

    try {
        // Wait for and click "Get Started"
        await metamaskPage.waitForSelector('[data-testid="onboarding-welcome-get-started"]', { timeout: 10000 });
        await metamaskPage.click('[data-testid="onboarding-welcome-get-started"]');
        console.log("✅ Clicked: Get Started");

        await delay(1000);

        // Click "Create a new wallet"
        await metamaskPage.waitForSelector('[data-testid="onboarding-create-wallet"]', { timeout: 10000 });
        await metamaskPage.click('[data-testid="onboarding-create-wallet"]');
        console.log("✅ Clicked: Create a new wallet");

        await delay(1000);

        // Opt out of analytics
        await metamaskPage.waitForSelector('[data-testid="metametrics-no-thanks"]', { timeout: 10000 });
        await metamaskPage.click('[data-testid="metametrics-no-thanks"]');
        console.log("✅ Clicked: No thanks (analytics)");

        await delay(1000);

        // Set password (Ask user for password or use default)
        const walletPassword = process.env.MM_PASSWORD || 'SecurePass123!';
        
        await metamaskPage.waitForSelector('input[data-testid="create-password-new"]', { timeout: 10000 });
        await metamaskPage.fill('input[data-testid="create-password-new"]', walletPassword);
        await metamaskPage.fill('input[data-testid="create-password-confirm"]', walletPassword);
        await metamaskPage.click('input[data-testid="create-password-terms"]');
        console.log("✅ Password set");

        await delay(500);

        // Click Create
        await metamaskPage.click('[data-testid="create-password-import"]');
        console.log("✅ Creating wallet...");

        await delay(3000);

        // Wait for secure wallet screen
        await metamaskPage.waitForSelector('[data-testid="secure-wallet-recommended"]', { timeout: 15000 });
        await metamaskPage.click('[data-testid="secure-wallet-recommended"]');
        console.log("✅ Clicked: Secure my wallet");

        await delay(1000);

        // Reveal seed phrase
        await metamaskPage.waitForSelector('[data-testid="reveal-seed-phrase"]', { timeout: 10000 });
        await metamaskPage.click('[data-testid="reveal-seed-phrase"]');

        await delay(1000);

        // Extract seed phrase
        const seedPhrase = await metamaskPage.locator('[data-testid="recovery-phrase-chips"] p').allTextContents();
        const fullSeedPhrase = seedPhrase.join(' ').trim();
        
        console.log("\n" + "=".repeat(60));
        console.log("🔐 IMPORTANT: SAVE THIS SEED PHRASE SECURELY!");
        console.log("=".repeat(60));
        console.log("Seed Phrase:", fullSeedPhrase);
        console.log("=".repeat(60) + "\n");

        // Save to file
        fs.writeFileSync('.seed-phrase.txt', `Seed Phrase: ${fullSeedPhrase}\nCreated: ${new Date().toISOString()}\n`);
        fs.chmodSync('.seed-phrase.txt', 0o600);
        console.log("💾 Seed phrase saved to .seed-phrase.txt (restricted access)");

        // Confirm seed phrase
        await metamaskPage.click('[data-testid="recovery-phrase-next"]');
        console.log("✅ Proceeded to confirmation");

        // Confirm each word
        const confirmWords = await metamaskPage.locator('[data-testid="recovery-phrase-input-"]').all();
        for (let i = 0; i < confirmWords.length; i++) {
            const indexAttr = await confirmWords[i].getAttribute('data-testid');
            const match = indexAttr.match(/input-(\d+)/);
            if (match) {
                const wordIndex = parseInt(match[1]);
                await confirmWords[i].fill(seedPhrase[wordIndex]);
            }
        }

        await metamaskPage.click('[data-testid="recovery-phrase-confirm"]');
        console.log("✅ Seed phrase confirmed");

        await delay(1000);

        // Got it button
        await metamaskPage.waitForSelector('[data-testid="onboarding-complete-done"]', { timeout: 10000 });
        await metamaskPage.click('[data-testid="onboarding-complete-done"]');
        console.log("✅ Wallet creation complete!");

        await delay(1000);

        // Pin extension
        await metamaskPage.click('[data-testid="pin-extension-next"]');
        await metamaskPage.click('[data-testid="pin-extension-done"]');
        console.log("✅ MetaMask setup finished!");

        console.log("\n🎉 Wallet Address:", await getWalletAddress(metamaskPage));

        // Keep browser open
        console.log("\n⏳ Browser will stay open. Press Ctrl+C to exit.");
        await new Promise(() => {});

    } catch (error) {
        console.error("❌ Error during setup:", error.message);
        console.log("\n💡 Tips:");
        console.log("   - MetaMask UI might have changed");
        console.log("   - Check if extension loaded correctly");
        console.log("   - Try running with: MM_PASSWORD=yourpassword node agent.js");
        
        // Keep browser open for debugging
        await new Promise(() => {});
    }
}

async function getWalletAddress(page) {
    try {
        await page.click('[data-testid="account-menu-icon"]');
        await delay(500);
        const address = await page.locator('.account-list-item__account-address').first().textContent();
        return address;
    } catch (e) {
        return "Unable to fetch";
    }
}

setupMetaMask().catch(console.error);
AGENTEOF

echo "✅ Created agent.js"

# Create run script
cat > run.sh << 'RUNEOF'
#!/bin/bash
cd "$(dirname "$0")"
export DISPLAY=:1
Xvfb :1 -screen 0 1280x720x24 &
sleep 2
node agent.js
RUNEOF
chmod +x run.sh

# Create .env template
cat > .env.example << 'ENVEOF'
# MetaMask Password
MM_PASSWORD=YourSecurePassword123!

# Network RPC (Base Mainnet)
BASE_RPC=https://mainnet.base.org

# Wallet details (fill after wallet creation)
PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=your_wallet_address_here
ENVEOF

echo "✅ Created .env.example"

# Summary
echo ""
echo "=".repeat(60)
echo "📦 SETUP COMPLETE!"
echo "=".repeat(60)
echo ""
echo "📁 Project Location: $PROJECT_DIR"
echo ""
echo "🚀 TO RUN:"
echo "   1. cd $PROJECT_DIR"
echo "   2. export MM_PASSWORD=your_secure_password"
echo "   3. node agent.js"
echo ""
echo "📝 OR USE: bash run.sh"
echo ""
echo "⚠️  NOTE:"
echo "   - Set your own password in MM_PASSWORD"
echo "   - Seed phrase will be saved to .seed-phrase.txt"
echo "   - Keep seed phrase SECRET and SAFE!"
echo ""
echo "=".repeat(60)
