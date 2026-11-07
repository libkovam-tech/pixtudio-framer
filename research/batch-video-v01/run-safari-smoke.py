"""Run the research diagnostic in real Safari via Apple's WebDriver."""

import json
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / "evidence" / "safari-macos-vm-opus-webm.json"
FIXTURE = ROOT / "safari-smoke-opus.webm"


def main():
    driver = webdriver.Safari()
    try:
        print(json.dumps({"browser": driver.capabilities.get("browserName"),
                          "browserVersion": driver.capabilities.get("browserVersion"),
                          "platform": driver.capabilities.get("platformName")}))
        driver.get("http://127.0.0.1:5177/")
        driver.find_element(By.ID, "file").send_keys(str(FIXTURE))
        driver.find_element(By.ID, "run").click()

        def completed(browser):
            raw = browser.find_element(By.ID, "result").text
            if not raw.startswith("{"):
                return False
            return json.loads(raw)

        result = WebDriverWait(driver, 120).until(completed)
        EVIDENCE.parent.mkdir(exist_ok=True)
        EVIDENCE.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        summary = {"status": result.get("status"), "checks": result.get("checks"),
                   "file": result.get("file"), "error": result.get("error")}
        print(json.dumps(summary, ensure_ascii=False))
        if result.get("file", {}).get("name") != FIXTURE.name:
            raise AssertionError("Safari did not diagnose the selected WebM")
        if result.get("checks", {}).get("demux") != "PASS":
            raise AssertionError("Safari WebM demux failed")
        if result.get("checks", {}).get("decoderSupport") != "PASS":
            raise AssertionError("Safari VP9 WebCodecs support failed")
        if result.get("checks", {}).get("audio") != "PASS":
            raise AssertionError("Safari Opus copy failed")
        if not result.get("status", "").startswith("PASS"):
            raise AssertionError("Safari diagnostic did not pass")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
