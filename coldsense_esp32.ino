/*
  ColdSense — ESP32 firmware (DHT11 + MPU6050 + SSD1306 OLED)
  Libraries (Arduino Library Manager): DHT sensor library, Adafruit Unified Sensor,
  Adafruit MPU6050, Adafruit SSD1306, Adafruit GFX
  Wiring:  DHT11 DATA -> GPIO4 | OLED & MPU6050 SDA -> GPIO21, SCL -> GPIO22 (3.3V, GND shared)
           Peltier MOSFET/relay IN -> GPIO26 | Inside fans -> GPIO27 | Outside fan -> GPIO25
  NOTE: Peltiers and fans must be switched by logic-level MOSFET modules or relays, never directly from GPIO.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_SSD1306.h>

// ---------- USER SETTINGS ----------
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* FS_PROJECT = "YOUR_PROJECT_ID";   // Firebase project id
const char* FS_API_KEY = "YOUR_API_KEY";      // Firebase web API key
const char* FS_COLLECTION = "readings";

// ---------- PINS ----------
#define DHT_PIN 4
#define PELTIER_PIN 26
#define IN_FAN_PIN 27
#define OUT_FAN_PIN 25

// ---------- RISK MODEL (matches js/risk.js) ----------
const float TMIN = 2.0, TMAX = 8.0, SHOCK_G = 1.8;
const float K1 = 0.9, K2 = 1.5, REPEAT_W = 0.25;
const int INT_LOW = 30, INT_ELEV = 10, INT_CRIT = 3;   // seconds

DHT dht(DHT_PIN, DHT11);
Adafruit_MPU6050 mpu;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

float risk = 0; int repeats = 0; bool inExc = false;
bool cooling = false; unsigned long lastSample = 0, lastSend = 0;
int intervalSec = INT_LOW; float lastTemp = 5, lastHum = 50;
bool mpuOK = false;

const char* decide(float c) {
  if (c >= 90) return "CONTINUE";
  if (c >= 75) return "MONITOR";
  if (c >= 60) return "PRIORITIZE DELIVERY";
  if (c >= 40) return "INSPECTION REQUIRED";
  return "HIGH RISK";
}

float readShockG() {
  if (!mpuOK) return 1.0;
  sensors_event_t a, g, t; mpu.getEvent(&a, &g, &t);
  float m = sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z) / 9.81;
  return m;
}

void sendToFirebase(long long tms, float temp, float hum, float shock, float cond, const char* level, const char* dec) {
  if (WiFi.status() != WL_CONNECTED) return;     // edge logic keeps running offline
  WiFiClientSecure c; c.setInsecure();           // prototype only; pin the certificate for production
  HTTPClient http;
  String url = String("https://firestore.googleapis.com/v1/projects/") + FS_PROJECT + "/databases/(default)/documents/" + FS_COLLECTION + "?key=" + FS_API_KEY;
  String body = "{\"fields\":{";
  body += "\"t\":{\"integerValue\":\"" + String((unsigned long long)tms) + "\"},";
  body += "\"temp\":{\"doubleValue\":" + String(temp, 2) + "},";
  body += "\"hum\":{\"doubleValue\":" + String(hum, 1) + "},";
  body += "\"shock\":{\"doubleValue\":" + String(shock, 2) + "},";
  body += "\"risk\":{\"doubleValue\":" + String(risk, 2) + "},";
  body += "\"cond\":{\"doubleValue\":" + String(cond, 1) + "},";
  body += "\"interval\":{\"integerValue\":\"" + String(intervalSec) + "\"},";
  body += "\"level\":{\"stringValue\":\"" + String(level) + "\"},";
  body += "\"decision\":{\"stringValue\":\"" + String(dec) + "\"},";
  body += "\"cooling\":{\"booleanValue\":" + String(cooling ? "true" : "false") + "}}}";
  if (http.begin(c, url)) { http.addHeader("Content-Type", "application/json"); int code = http.POST(body); Serial.printf("POST %d\n", code); http.end(); }
}

void drawOLED(float temp, float hum, float cond, const char* level, const char* dec) {
  oled.clearDisplay(); oled.setTextColor(WHITE);
  oled.setTextSize(2); oled.setCursor(0, 0); oled.printf("%.1fC", temp);
  oled.setTextSize(1); oled.setCursor(80, 4); oled.printf("H:%.0f%%", hum);
  oled.setCursor(0, 22); oled.printf("Life: %.0f%%  [%s]", cond, level);
  oled.setCursor(0, 34); oled.printf("Risk:%.1f  Int:%ds", risk, intervalSec);
  oled.setCursor(0, 46); oled.println(dec);
  oled.setCursor(0, 56); oled.print(WiFi.status() == WL_CONNECTED ? "WiFi OK " : "OFFLINE "); oled.print(cooling ? "COOL" : "idle");
  oled.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(PELTIER_PIN, OUTPUT); pinMode(IN_FAN_PIN, OUTPUT); pinMode(OUT_FAN_PIN, OUTPUT);
  Wire.begin(21, 22); dht.begin();
  oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  mpuOK = mpu.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(19800, 0, "pool.ntp.org");           // IST = UTC+5:30
  oled.clearDisplay(); oled.setCursor(0, 0); oled.setTextSize(1); oled.println("ColdSense booting..."); oled.display();
}

void loop() {
  if (millis() - lastSample < (unsigned long)intervalSec * 1000UL && lastSample != 0) return;
  float dt = lastSample == 0 ? intervalSec : (millis() - lastSample) / 1000.0;
  lastSample = millis();

  float t = dht.readTemperature(), h = dht.readHumidity();
  if (isnan(t)) t = lastTemp; if (isnan(h)) h = lastHum;
  lastTemp = t; lastHum = h;
  float g = readShockG();

  // cooling control with hysteresis (set point inside the safe band)
  if (t > 6.5) cooling = true; else if (t < 3.5) cooling = false;
  digitalWrite(PELTIER_PIN, cooling); digitalWrite(IN_FAN_PIN, cooling); digitalWrite(OUT_FAN_PIN, cooling);

  // cumulative risk
  float exc = t > TMAX ? t - TMAX : (t < TMIN ? TMIN - t : 0);
  if (exc > 0 && !inExc) repeats++;
  inExc = exc > 0;
  risk += exc * (dt / 60.0) * K1 * (1 + REPEAT_W * max(0, repeats - 1));
  float dg = fabs(g - 1.0) + 1.0;                 // deviation from 1 g gravity -> shock magnitude
  if (dg > SHOCK_G) risk += (dg - SHOCK_G) * K2;
  float cond = max(0.0f, 100.0f - risk);

  const char* level = (exc > 4 || cond < 40) ? "critical" : ((exc > 0 || dg > SHOCK_G || cond < 75) ? "elevated" : "low");
  intervalSec = strcmp(level, "critical") == 0 ? INT_CRIT : (strcmp(level, "elevated") == 0 ? INT_ELEV : INT_LOW);
  const char* dec = decide(cond);

  drawOLED(t, h, cond, level, dec);
  Serial.printf("T=%.1f H=%.0f g=%.2f risk=%.2f cond=%.1f %s %s\n", t, h, dg, risk, cond, level, dec);

  time_t now = time(nullptr);
  if (now > 1700000000 && millis() - lastSend >= (unsigned long)INT_CRIT * 1000UL) {   // NTP synced; max 1 post / 3 s
    lastSend = millis();
    sendToFirebase((long long)now * 1000LL, t, h, dg, cond, level, dec);
  }
}
