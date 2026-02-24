from config import get_setting

def log_info(msg):
    prefix = get_setting("LOG_PREFIX")
    print(f"[{prefix}] {msg}")
