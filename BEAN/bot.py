import os
import json
import time
import random
from dotenv import load_dotenv
from web3 import Web3
from web3.middleware import geth_poa_middleware
from colorama import Fore, Style, init
import pyfiglet  # Added for ASCII art

# Initialize colorama
init(autoreset=True)

# Load environment variables
load_dotenv()

# Network configuration
RPC_URL = "https://testnet-rpc.monad.xyz"
CHAIN_ID = 10143
EXPLORER_URL = "https://testnet.monadexplorer.com/tx/"
ROUTER_ADDRESS = "0xCa810D095e90Daae6e867c19DF6D9A8C56db2c89"

# Available tokens
TOKENS = {
    "YAKI": {"address": "0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50", "decimal": 18},
    "USDC": {"address": "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea", "decimal": 6},
    "aprMON": {"address": "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A", "decimal": 18},
    "WMON": {"address": "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701", "decimal": 18},
    "CHOG": {"address": "0xE0590015A873bF326bd645c3E1266d4db41C4E6B", "decimal": 18},
    "DAK": {"address": "0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714", "decimal": 18},
    "BEAN": {"address": "0x268E4E24E0051EC27b3D27A95977E71cE6875a05", "decimal": 18},
    "10k Returns": {"address": "0xc7765d451A86F4EB14d28582d131A6afe0b39790", "decimal": 18},
    "JAI": {"address": "0xCc5B42F9d6144DFDFb6fb3987a2A916af902F5f8", "decimal": 6},
    "gMON": {"address": "0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3", "decimal": 18},
    "MIST": {"address": "0xb38bb873cca844b20A9eE448a87Af3626a6e1EF5", "decimal": 18},
    "MONAI": {"address": "0x7348FAC1b35bE27B0b636F0881AFc9449eC54bA5", "decimal": 18}
}

# Initialize Web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))
w3.middleware_onion.inject(geth_poa_middleware, layer=0)

# ABI
ERC20_ABI = json.loads('''[
    {
        "constant": true,
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    },
    {
        "constant": false,
        "inputs": [
            {"name": "spender", "type": "address"},
            {"name": "value", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "payable": false,
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
]''')

ROUTER_ABI = json.loads('''[
    {
        "inputs": [
            {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
            {"internalType": "uint256", "name": "amountOutMin", "type": "uint256"},
            {"internalType": "address[]", "name": "path", "type": "address[]"},
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "deadline", "type": "uint256"}
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]''')

def print_success(message):
    print(Fore.GREEN + message + Style.RESET_ALL)

def print_error(message):
    print(Fore.RED + message + Style.RESET_ALL)

def print_info(message):
    print(Fore.CYAN + message + Style.RESET_ALL)

def print_warning(message):
    print(Fore.YELLOW + message + Style.RESET_ALL)

def print_magenta(message):
    print(Fore.MAGENTA + message + Style.RESET_ALL)

def show_banner():
    """Display ASCII art banner"""
    ascii_art = pyfiglet.figlet_format('BOT BEAN MADE BY JAWA', font='ansi_shadow')
    print(Fore.MAGENTA + ascii_art)
    print()

def get_native_balance(wallet_address):
    """Get native MON balance in ether"""
    balance = w3.eth.get_balance(wallet_address)
    return w3.from_wei(balance, 'ether')

def load_wallets_from_env():
    """Load wallets from environment variables"""
    wallets = []
    for key, value in os.environ.items():
        if key.startswith('WALLET_'):
            wallets.append(value)
    return wallets

def select_wallet(wallets):
    """Select wallet from list"""
    print_info("\nAvailable Wallets:")
    for i, wallet in enumerate(wallets, 1):
        account = w3.eth.account.from_key(wallet)
        print(f"{i}. {account.address[:6]}...{account.address[-4:]}")
    
    while True:
        try:
            choice = int(input("Select wallet (1-{}): ".format(len(wallets))))
            if 1 <= choice <= len(wallets):
                return wallets[choice-1]
            print_error("Invalid selection")
        except ValueError:
            print_error("Please enter a number")

def approve_token(private_key, token_address, spender):
    """Approve unlimited tokens"""
    account = w3.eth.account.from_key(private_key)
    token_contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)
    
    tx = token_contract.functions.approve(
        spender,
        2**256 - 1  # Unlimited approval
    ).build_transaction({
        'chainId': CHAIN_ID,
        'gas': 200000,
        'gasPrice': w3.eth.gas_price,
        'nonce': w3.eth.get_transaction_count(account.address),
    })
    
    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    return w3.eth.wait_for_transaction_receipt(tx_hash)

def check_allowance(private_key, token_address, spender):
    """Check token allowance"""
    account = w3.eth.account.from_key(private_key)
    token_contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)
    return token_contract.functions.allowance(account.address, spender).call()

def check_balance(private_key, token_address):
    """Check token balance"""
    account = w3.eth.account.from_key(private_key)
    token_contract = w3.eth.contract(address=token_address, abi=ERC20_ABI)
    return token_contract.functions.balanceOf(account.address).call()

def swap_tokens(private_key, amount_in, path, deadline):
    """Execute token swap with 5% slippage"""
    account = w3.eth.account.from_key(private_key)
    router_contract = w3.eth.contract(address=ROUTER_ADDRESS, abi=ROUTER_ABI)
    
    # 5% slippage
    amount_out_min = int(amount_in * 0.95)
    
    tx = router_contract.functions.swapExactTokensForTokens(
        amount_in,
        amount_out_min,
        path,
        account.address,
        deadline
    ).build_transaction({
        'chainId': CHAIN_ID,
        'gas': 300000,
        'gasPrice': w3.eth.gas_price,
        'nonce': w3.eth.get_transaction_count(account.address),
    })
    
    signed_tx = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    return w3.eth.wait_for_transaction_receipt(tx_hash)

def get_random_pair():
    """Get random token pair"""
    tokens = list(TOKENS.keys())
    token_in, token_out = random.sample(tokens, 2)
    return token_in, token_out

def check_and_approve_all_tokens(private_key):
    """Check and approve all tokens"""
    account = w3.eth.account.from_key(private_key)
    print_magenta(f"\n🔹 Wallet: {account.address}")
    print_info(f"💰 Initial MON Balance: {get_native_balance(account.address)} MON")
    
    for token_name, token_data in TOKENS.items():
        token_address = token_data["address"]
        allowance = check_allowance(private_key, token_address, ROUTER_ADDRESS)
        
        if allowance == 0:
            print_warning(f"⚠️ Approving {token_name}...")
            try:
                receipt = approve_token(private_key, token_address, ROUTER_ADDRESS)
                print_success(f"✓ {token_name} approved")
                print_info(f"Tx: {EXPLORER_URL}{receipt.transactionHash.hex()}")
                time.sleep(random.randint(1, 3))
            except Exception as e:
                print_error(f"✗ {token_name} approval failed: {str(e)}")

def main_loop(private_key):
    """Main trading loop"""
    account = w3.eth.account.from_key(private_key)
    print_magenta(f"\n🚀 Starting Swap Bot for Wallet: {account.address}")
    
    # Check and approve all tokens
    check_and_approve_all_tokens(private_key)
    
    while True:
        try:
            # Get random pair
            token_in_name, token_out_name = get_random_pair()
            token_in = TOKENS[token_in_name]
            token_out = TOKENS[token_out_name]
            
            # Get balance
            balance = check_balance(private_key, token_in["address"])
            if balance == 0:
                print_warning(f"✗ Insufficient {token_in_name} balance")
                time.sleep(random.randint(1, 5))
                continue
                
            # Calculate 5% of balance
            amount_to_swap = int(balance * 0.05)
            if amount_to_swap == 0:
                print_warning(f"✗ {token_in_name} balance too small")
                time.sleep(random.randint(1, 5))
                continue
                
            # Get initial MON balance
            initial_mon_balance = get_native_balance(account.address)
            
            # Path and deadline
            path = [token_in["address"], token_out["address"]]
            deadline = int(time.time()) + 1200  # 20 minutes from now
            
            # Human readable amount
            amount_human = amount_to_swap / (10 ** token_in["decimal"])
            
            # Print swap info
            print_magenta(f"\n🔹 Wallet: {account.address}")
            print_info(f"🔄 Swapping {amount_human:.6f} {token_in_name} → {token_out_name}...")
            
            # Execute swap
            receipt = swap_tokens(private_key, amount_to_swap, path, deadline)
            
            # Get remaining MON balance
            remaining_mon_balance = get_native_balance(account.address)
            fee_used = float(initial_mon_balance) - float(remaining_mon_balance)
            
            # Print results
            print_success("✅ Swap success!")
            print_warning(f"⛽ Gas used: {receipt.gasUsed} | Fee: ~{fee_used:.6f} MON")
            print_info(f"💰 Remaining MON balance: {remaining_mon_balance} MON")
            print(f"📜 Tx: {EXPLORER_URL}{receipt.transactionHash.hex()}")
            
            # Random delay before next swap
            delay = random.randint(5, 15)
            print_info(f"⏳ Next swap in {delay} seconds...")
            time.sleep(delay)
            
        except KeyboardInterrupt:
            print_info("\nBot stopped by user")
            break
        except Exception as e:
            print_error(f"✗ Swap failed: {str(e)}")
            # Show balance even if swap fails
            mon_balance = get_native_balance(account.address)
            print_info(f"💰 MON Balance: {mon_balance} MON")
            print_info("⏳ Retrying in 5-15 seconds...")
            time.sleep(random.randint(5, 15))

if __name__ == "__main__":
    # Show banner
    show_banner()
    
    # Load wallets from .env
    wallets = load_wallets_from_env()
    if not wallets:
        print_error("No wallets found in .env file")
        print_error("Please add wallets with format WALLET_1=private_key")
        exit()
    
    # Select wallet
    private_key = select_wallet(wallets)
    
    # Start bot
    try:
        main_loop(private_key)
    except Exception as e:
        print_error(f"Fatal error: {str(e)}")
