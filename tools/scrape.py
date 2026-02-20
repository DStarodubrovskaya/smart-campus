import time
import pandas as pd
import os
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException

# === START PAGE ===
INITIAL_START_PAGE = 1
# ==================

# --- CONFIGURATION ---
SEARCH_BTN_ID = "ContentPlaceHolder1_btnSearch"
DETAILS_BTN_XPATH = "//a[contains(@id, 'lnkDetails')]"
BACK_BTN_XPATH = "//*[@id='btnBack']"
OUTPUT_FILE = f"biu_data_page_{INITIAL_START_PAGE}_onwards_try.csv"



def check_browser_pulse(driver):
    try:
        driver.current_url
        return True
    except:
        return False

def wait_for_captcha_clearance(driver):
    fail_count = 0
    while True:
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
            fail_count = 0 
            if "anomaly detected" in body_text or "captcha" in body_text:
                print("\n>>> CAPTCHA DETECTED! SCRIPT PAUSED.")
                print(">>> Press ENTER once you have solved it.")
                input()
                time.sleep(3)
                continue 
            return False
        except Exception:
            fail_count += 1
            time.sleep(1)
            if fail_count > 10:
                if not check_browser_pulse(driver): raise WebDriverException("Browser died.")
            if fail_count > 20: raise WebDriverException("Browser timeout.")

def safe_click(driver, element):
    for attempt in range(3):
        try:
            driver.execute_script("arguments[0].scrollIntoView(true);", element)
            time.sleep(0.5)
            try: element.click()
            except: driver.execute_script("arguments[0].click();", element)
            return True 
        except Exception:
            if wait_for_captcha_clearance(driver): return False 
            time.sleep(1)
    return False

def save_data_to_csv(data_list):
    """Appends data to CSV immediately so nothing is lost on crash."""
    if not data_list: return
    df = pd.DataFrame(data_list)
    # If file doesn't exist, write header. If it does, append without header.
    header = not os.path.exists(OUTPUT_FILE)
    df.to_csv(OUTPUT_FILE, mode='a', header=header, index=False, encoding='utf-8-sig')
    print(f"    (Saved {len(data_list)} courses to {OUTPUT_FILE})")

def run_scraper_session(start_page):
    """
    Runs a single browser session. 
    Returns: The number of the next page to scrape (if crashed), or -1 if done.
    """
    driver = uc.Chrome(version_main=142)
    driver.maximize_window()
    current_page = start_page
    
    try:
        driver.get("https://courses.biu.ac.il/")
        print(">>> Browser Started. Press ENTER to begin...")
        # Automating the ENTER press for restart convenience? 
        # Better to keep manual for first login, but on restarts maybe wait 10s?
        # For now, let's stick to manual input to be safe with Captchas.
        input("Press ENTER when ready...")

        # 1. Search
        search_btn = driver.find_element(By.ID, SEARCH_BTN_ID)
        safe_click(driver, search_btn)
        WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, DETAILS_BTN_XPATH)))

        # 2. Smart Jump
        print(f"\n>>> Jumping to Page {start_page}...")
        curr_marker = 1
        if start_page > 1:
            while curr_marker < start_page:
                wait_for_captcha_clearance(driver)
                # Try Direct Link
                try:
                    target = driver.find_element(By.XPATH, f"//a[normalize-space()='{start_page}']")
                    safe_click(driver, target)
                    time.sleep(4)
                    break # Arrived
                except: pass
                # Try '...'
                try:
                    dots = driver.find_elements(By.LINK_TEXT, "...")
                    if dots: 
                        safe_click(driver, dots[-1])
                        time.sleep(4)
                    else:
                        print("Navigation failed.")
                        return current_page # Retry same page
                except: 
                    return current_page
                
        # 3. Scraping Loop
        while True:
            print(f"\n>>> PROCESSING PAGE {current_page}...")
            page_data = []
            
            # Scrape Page
            while True:
                try:
                    courses = driver.find_elements(By.XPATH, DETAILS_BTN_XPATH)
                    if not courses: break

                    for j in range(len(courses)):
                        # Re-find
                        courses = driver.find_elements(By.XPATH, DETAILS_BTN_XPATH)
                        if j >= len(courses): break
                        
                        if not safe_click(driver, courses[j]): break
                        
                        try: WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.XPATH, BACK_BTN_XPATH)))
                        except: 
                            driver.back(); continue
                        
                        # Extract
                        c_data = {"Page": current_page}
                        try: c_data["Faculty"] = driver.find_element(By.XPATH, "//*[contains(text(), 'פוקלטה') or contains(text(), 'מחלקה')]/..").text.strip()
                        except: pass
                        try: c_data["Course"] = driver.find_element(By.XPATH, "//*[contains(text(), 'קוד קורס')]/..").text.replace("קוד קורס", "").replace(":", "").strip()
                        except: pass
                        try: c_data["Semester"] = driver.find_element(By.XPATH, "//*[contains(text(), 'סמסטר')]").text.replace("סמסטר", "").strip()
                        except: pass
                        try: c_data["Day"] = driver.find_element(By.XPATH, "//*[contains(text(), 'יום')]/..").text.replace("יום", "").replace(":", "").strip()
                        except: pass
                        try: c_data["Time"] = driver.find_element(By.XPATH, "//*[contains(text(), 'שעה')]/..").text.replace("שעה", "").replace(":", "").strip()
                        except: pass
                        try: c_data["Building"] = driver.find_element(By.XPATH, "//*[contains(text(), 'בניין')]/..").text.replace("בניין", "").replace(":", "").strip()
                        except: pass
                        try: c_data["Room"] = driver.find_element(By.XPATH, "//*[contains(text(), 'חדר')]/..").text.replace("חדר", "").replace(":", "").strip()
                        except: pass

                        if "Building" in c_data:
                            print(f"    -> {c_data['Building']} {c_data.get('Room','')}")
                            page_data.append(c_data)

                        driver.back()
                        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.XPATH, DETAILS_BTN_XPATH)))
                    
                    # Save Batch immediately after page is done
                    save_data_to_csv(page_data)
                    break # Page done
                except Exception as e:
                    print(f"Page Error: {e}")
                    wait_for_captcha_clearance(driver)
                    # If heavily broken, return current page to restart session
                    return current_page

            # Navigate Next
            next_p = current_page + 1
            moved = False
            for _ in range(3):
                try:
                    lnk = driver.find_element(By.XPATH, f"//a[normalize-space()='{next_p}']")
                    if safe_click(driver, lnk):
                        time.sleep(4)
                        current_page += 1
                        moved = True
                        break
                except:
                    try:
                        dots = driver.find_elements(By.LINK_TEXT, "...")
                        if dots and safe_click(driver, dots[-1]):
                            time.sleep(5)
                            current_page += 1
                            moved = True
                            break
                    except: pass
                time.sleep(2)
            
            if not moved:
                print("End of list or Stuck.")
                return -1 # Done

    except Exception as e:
        print(f"CRASH DETECTED: {e}")
    finally:
        try: driver.quit()
        except: pass
        
    return current_page # Return where we need to start next

# === MAIN CONTROL LOOP ===
if __name__ == "__main__":
    next_start = INITIAL_START_PAGE
    
    while next_start != -1:
        print(f"\n{'='*40}")
        print(f"STARTING NEW SESSION AT PAGE {next_start}")
        print(f"{'='*40}")
        
        # Run the scraper. It will return the page number where it crashed.
        last_page = run_scraper_session(next_start)
        
        if last_page == -1:
            print("Scraping Completed Successfully!")
            break
        else:
            print(f"\n!!! Session crashed at Page {last_page}. Restarting in 10 seconds...")
            next_start = last_page # Resume from the crash point
            time.sleep(10)