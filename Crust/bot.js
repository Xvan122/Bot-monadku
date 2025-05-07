require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');

// Configuration
const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');
const PRIVATE_KEYS = process.env.PRIVATE_KEYS.split(',');
const WALLETS = PRIVATE_KEYS.map(key => new ethers.Wallet(key.trim(), provider));

// All requested token pairs
const SWAP_ROUTER_ADDRESS = '0x021724a16C7831be1FaA306A324438Ed95a6144E';
const TOKENS = {
    USDT: {
        address: '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D',
        decimals: 6,
        symbol: 'USDT'
    },
    USDC: {
        address: '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea',
        decimals: 6,
        symbol: 'USDC'
    },
    MIST: {
        address: '0xb38bb873cca844b20A9eE448a87Af3626a6e1EF5',
        decimals: 18,
        symbol: 'MIST'
    },
    YAKI: {
        address: '0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50',
        decimals: 18,
        symbol: 'YAKI'
    },
    CHOG: {
        address: '0xE0590015A873bF326bd645c3E1266d4db41C4E6B',
        decimals: 18,
        symbol: 'CHOG'
    },
    aprMON: {
        address: '0xb2f82D0f38dc453D596Ad40A37799446Cc89274A',
        decimals: 18,
        symbol: 'aprMON'
    },
    DAK: {
        address: '0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714',
        decimals: 18,
        symbol: 'DAK'
    },
    gMON: {
        address: '0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3',
        decimals: 18,
        symbol: 'gMON'
    },
    WMON: {
        address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
        decimals: 18,
        symbol: 'WMON'
    }
};

// Complete ABI
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

const ROUTER_ABI = [
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"
];

// Custom logging with emoji and colors
function logSwapStart(walletAddress, amount, fromSymbol, toSymbol) {
    console.log(`${chalk.magentaBright('🔹')} Wallet: ${walletAddress}`);
    console.log(`${chalk.blueBright('🔄')} Swapping ${amount} ${fromSymbol} → ${toSymbol}...`);
}

function logSwapSuccess(gasUsed, fee, remainingBalance, txHash) {
    console.log(`${chalk.green('✅')} Swap success!`);
    console.log(`${chalk.yellow('⛽')} Gas used: ${gasUsed} | Fee: ~${fee} MON`);
    console.log(`${chalk.blueBright('💰')} Remaining MON balance: ${remainingBalance} MON`);
    console.log(`📜 Tx: https://testnet.monadexplorer.com/tx/${txHash}`);
}

function logSwapError(error, txHash = '') {
    console.log(`${chalk.red('❌')} ${error}`);
    if (txHash) {
        console.log(`📜 Failed Tx: https://testnet.monadexplorer.com/tx/${txHash}`);
    }
}

function logNextSwap(delaySeconds) {
    console.log(`${chalk.cyan('⏳')} Next swap in ${delaySeconds} seconds...\n`);
}

async function getTokenInfo(wallet, tokenAddress) {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const [balance, decimals, symbol] = await Promise.all([
            tokenContract.balanceOf(wallet.address),
            tokenContract.decimals(),
            tokenContract.symbol()
        ]);
        return { balance, decimals, symbol };
    } catch (error) {
        logSwapError(`Failed to get token info: ${error.shortMessage || error.message}`);
        return null;
    }
}

async function ensureApproval(wallet, tokenAddress) {
    try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
        const allowance = await tokenContract.allowance(wallet.address, SWAP_ROUTER_ADDRESS);
        
        if (allowance === 0n) {
            const approveTx = await tokenContract.approve(
                SWAP_ROUTER_ADDRESS, 
                ethers.MaxUint256,
                { gasLimit: 200000 }
            );
            await approveTx.wait();
            return true;
        }
        return false;
    } catch (error) {
        logSwapError(`Approval failed: ${error.shortMessage || error.message}`);
        return false;
    }
}

async function performSwap(wallet, fromToken, toToken) {
    try {
        // Get token info
        const fromInfo = await getTokenInfo(wallet, fromToken.address);
        const toInfo = await getTokenInfo(wallet, toToken.address);
        
        if (!fromInfo || !toInfo) return false;

        // Calculate 10% of balance
        const amountIn = fromInfo.balance / 10n;
        const amountFormatted = ethers.formatUnits(amountIn, fromInfo.decimals);

        // Log swap start
        logSwapStart(wallet.address, amountFormatted, fromInfo.symbol, toInfo.symbol);

        // Check balances
        if (fromInfo.balance === 0n) {
            throw new Error(`No ${fromInfo.symbol} balance`);
        }

        const monBalance = await provider.getBalance(wallet.address);
        if (monBalance < ethers.parseEther('0.02')) {
            throw new Error('Insufficient MON for gas fees');
        }

        // Ensure approval
        await ensureApproval(wallet, fromToken.address);

        // Perform swap
        const routerContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, ROUTER_ABI, wallet);

        const params = {
            tokenIn: fromToken.address,
            tokenOut: toToken.address,
            fee: 3000,
            recipient: wallet.address,
            deadline: Math.floor(Date.now() / 1000) + 1200,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        };

        const tx = await routerContract.exactInputSingle(params, {
            gasLimit: 500000,
            gasPrice: ethers.parseUnits('52', 'gwei')
        });

        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed.toString();
        const fee = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
        const newMonBalance = ethers.formatEther(await provider.getBalance(wallet.address));

        // Log success
        logSwapSuccess(gasUsed, fee, newMonBalance, receipt.hash);
        return true;

    } catch (error) {
        logSwapError(error.shortMessage || error.message, error.transactionHash);
        return false;
    }
}

function getRandomDelay() {
    return Math.floor(Math.random() * 10000) + 5000; // 5-15 seconds
}

async function main() {
    console.log(chalk.bold('Available Wallets:'));
    WALLETS.forEach((wallet, index) => {
        console.log(`${index + 1}. ${wallet.address}`);
    });

    const selectedWallet = WALLETS[0];
    console.log(`\n${chalk.magentaBright('🔹')} Starting Swap Bot for Wallet: ${selectedWallet.address}\n`);

    let isRunning = true;
    process.on('SIGINT', () => {
        isRunning = false;
        console.log('\nBot stopped by user');
        process.exit();
    });

    // Generate all possible token pairs
    const tokenPairs = [];
    const tokenList = Object.values(TOKENS);
    
    for (let i = 0; i < tokenList.length; i++) {
        for (let j = 0; j < tokenList.length; j++) {
            if (i !== j) { // Avoid pairing token with itself
                tokenPairs.push({
                    from: tokenList[i],
                    to: tokenList[j]
                });
            }
        }
    }

    while (isRunning) {
        try {
            // Select random pair
            const pair = tokenPairs[Math.floor(Math.random() * tokenPairs.length)];
            await performSwap(selectedWallet, pair.from, pair.to);
            
            const delay = getRandomDelay();
            logNextSwap((delay/1000).toFixed(0));
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            console.log(`${chalk.red('❌')} Error: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

main();