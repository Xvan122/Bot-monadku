from cryptography.fernet import Fernet
import os

KEY_FILE = "secret.key"
DATA_FILE = "encrypted_data.txt"

def generate_key():
    key = Fernet.generate_key()
    with open(KEY_FILE, "wb") as key_file:
        key_file.write(key)
    return key

def load_key():
    if not os.path.exists(KEY_FILE):
        return generate_key()
    with open(KEY_FILE, "rb") as key_file:
        return key_file.read()

def encrypt_data(data):
    key = load_key()
    f = Fernet(key)
    return f.encrypt(data.encode())

def decrypt_data(encrypted_data):
    key = load_key()
    f = Fernet(key)
    return f.decrypt(encrypted_data).decode()

def save_private_key(private_key):
    encrypted = encrypt_data(private_key)
    with open(DATA_FILE, "wb") as f:
        f.write(encrypted)

def load_private_key():
    with open(DATA_FILE, "rb") as f:
        encrypted = f.read()
    return decrypt_data(encrypted)