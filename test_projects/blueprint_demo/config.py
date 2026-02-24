from logger import log_info

SETTINGS = {
    "LOG_PREFIX": "INFO",
    "DEBUG": True
}

def get_setting(key):
    if key not in SETTINGS:
        log_info(f"Setting {key} not found")
        return None
    return SETTINGS[key]
