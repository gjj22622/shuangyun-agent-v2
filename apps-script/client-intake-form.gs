/**
 * 双云 AI 行銷部 — 客戶自填表單
 *
 * 用法：
 * 1. 打開 Google Apps Script（script.google.com）
 * 2. 貼上此程式碼
 * 3. 設定 Script Properties：
 *    - SHUANGYUN_PLATFORM_URL = https://shuangyun-agent-platform.zeabur.app
 *    - SHUANGYUN_ADMIN_TOKEN = <admin secret token>
 * 4. 執行 createClientIntakeForm() 建立 Google Form
 * 5. 把 Form 連結發給客戶
 * 6. 客戶填完 → onFormSubmit 自動呼叫平台 API → 客戶自動建立
 */

// ===== 建立客戶自填 Google Form =====
function createClientIntakeForm() {
  const form = FormApp.create("双云 AI 行銷部 — 新客戶接入表單");
  form.setDescription(
    "歡迎加入双云 AI 行銷部！請填寫以下資訊，我們會用 AI 為您打造專屬的品牌行銷腦。\n" +
    "填完約需 5-10 分鐘。所有資訊僅供双云內部策略使用，不會對外公開。"
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(true);

  // === Section 1: 品牌基本 ===
  form.addPageBreakItem().setTitle("一、品牌基本資料");

  form.addTextItem()
    .setTitle("品牌名稱")
    .setHelpText("您的公司或品牌正式名稱")
    .setRequired(true);

  form.addTextItem()
    .setTitle("產業類別")
    .setHelpText("例如：醫療美容 / B2B SaaS / 在地餐飲 / 電商零售")
    .setRequired(true);

  form.addTextItem()
    .setTitle("負責人姓名")
    .setHelpText("品牌的創辦人或主要決策者")
    .setRequired(true);

  form.addTextItem()
    .setTitle("負責人 Email")
    .setHelpText("我們會用這個信箱聯繫您")
    .setRequired(true);

  // === Section 2: 品牌語調 ===
  form.addPageBreakItem().setTitle("二、品牌語調");

  form.addParagraphTextItem()
    .setTitle("語調風格")
    .setHelpText("您希望品牌對外溝通的感覺是什麼？用幾個形容詞描述。\n例如：專業、溫柔、有醫師背書感，避免過度推銷")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("禁談主題")
    .setHelpText("品牌絕對不能觸碰的話題或用語，AI 會自動避開這些。\n例如：療效保證、競品比較、政治敏感")
    .setRequired(true);

  // === Section 3: 行銷目標 ===
  form.addPageBreakItem().setTitle("三、行銷目標");

  form.addParagraphTextItem()
    .setTitle("主要目標")
    .setHelpText("接下來 3-6 個月最想達成的一件事\n例如：三個月內把 LINE 好友從 1,200 成長到 3,000")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("目標受眾")
    .setHelpText("您最想觸及的人是誰？年齡、職業、地區、特徵\n例如：30-50 歲雙北地區女性上班族")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("核心提案")
    .setHelpText("您提供的核心價值是什麼？客戶為什麼選您？\n例如：皮膚健康諮詢 + 微整療程套組，主打先諮詢再治療")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("目前痛點")
    .setHelpText("目前品牌在行銷上最大的困擾\n例如：內容產出慢、文案合規常出包")
    .setRequired(true);

  form.addTextItem()
    .setTitle("成功指標")
    .setHelpText("怎麼判斷做得好不好？用數字衡量\n例如：LINE +1800、官網表單月均 50")
    .setRequired(true);

  // === Section 4: 執行計畫 ===
  form.addPageBreakItem().setTitle("四、執行計畫");

  form.addCheckboxItem()
    .setTitle("偏好渠道（可多選）")
    .setHelpText("品牌主要在哪些平台發布內容？")
    .setChoiceValues(["Facebook", "Instagram", "LINE", "EDM", "部落格", "LinkedIn", "YouTube", "TikTok", "Google Business"])
    .setRequired(true);

  form.addTextItem()
    .setTitle("內容節奏")
    .setHelpText("每週/每月預計發多少內容？\n例如：每週 3 篇 IG + 1 篇部落格")
    .setRequired(true);

  form.addTextItem()
    .setTitle("Campaign 時段")
    .setHelpText("這波行銷活動的起訖時間\n例如：2026-04-15 to 2026-07-15")
    .setRequired(false);

  // 設定觸發器
  ScriptApp.newTrigger("onFormSubmit")
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log("表單已建立：" + form.getEditUrl());
  Logger.log("填寫連結：" + form.getPublishedUrl());

  return {
    editUrl: form.getEditUrl(),
    publishedUrl: form.getPublishedUrl(),
    formId: form.getId()
  };
}

// ===== 表單提交自動 Webhook =====
function onFormSubmit(event) {
  const responses = event.response.getItemResponses();
  const getValue = (title) => {
    const item = responses.find(r => r.getItem().getTitle() === title);
    return item ? item.getResponse() : "";
  };

  const channels = getValue("偏好渠道（可多選）");
  const preferredChannels = Array.isArray(channels) ? channels : (channels || "").split(",").map(s => s.trim()).filter(Boolean);

  const payload = {
    brandName: getValue("品牌名稱"),
    industry: getValue("產業類別"),
    ownerName: getValue("負責人姓名"),
    ownerEmail: getValue("負責人 Email"),
    toneOfVoice: getValue("語調風格"),
    bannedTopics: getValue("禁談主題"),
    primaryGoal: getValue("主要目標"),
    targetAudience: getValue("目標受眾"),
    keyOffer: getValue("核心提案"),
    currentPainPoint: getValue("目前痛點"),
    successMetric: getValue("成功指標"),
    preferredChannels: preferredChannels.length > 0 ? preferredChannels : ["Instagram"],
    contentCadence: getValue("內容節奏") || "每週 3 篇",
    campaignWindow: getValue("Campaign 時段") || "長期經營"
  };

  const props = PropertiesService.getScriptProperties();
  const platformUrl = props.getProperty("SHUANGYUN_PLATFORM_URL") || "http://localhost:8000";
  const adminToken = props.getProperty("SHUANGYUN_ADMIN_TOKEN") || "";

  try {
    const response = UrlFetchApp.fetch(platformUrl + "/api/onboarding", {
      method: "POST",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + adminToken,
        "X-Confirm-Cost": "true"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const statusCode = response.getResponseCode();
    const body = JSON.parse(response.getContentText());

    if (statusCode === 201 || statusCode === 200) {
      Logger.log("客戶建立成功：" + body.clientId + " / " + payload.brandName);

      // 發通知信給負責人
      if (payload.ownerEmail) {
        MailApp.sendEmail({
          to: payload.ownerEmail,
          subject: "歡迎加入双云 AI 行銷部 — " + payload.brandName,
          body: "您好 " + payload.ownerName + "，\n\n" +
                "感謝您填寫品牌接入表單！双云已經為「" + payload.brandName + "」建立了 AI 行銷腦。\n\n" +
                "我們的夥伴會在 1-2 個工作天內跟您聯繫，進一步了解品牌細節。\n\n" +
                "如果您有品牌相關的文件（品牌書、會議記錄、競品分析等），歡迎先準備好，\n" +
                "稍後夥伴會協助您上傳到品牌腦 Builder，讓 AI 更精準地為您服務。\n\n" +
                "双云行銷團隊 敬上"
        });
      }
    } else {
      Logger.log("建立失敗：" + statusCode + " / " + response.getContentText());
    }
  } catch (error) {
    Logger.log("Webhook 呼叫失敗：" + error.toString());
  }
}

// ===== 測試用：手動觸發 =====
function testWebhook() {
  const props = PropertiesService.getScriptProperties();
  const platformUrl = props.getProperty("SHUANGYUN_PLATFORM_URL") || "http://localhost:8000";
  const adminToken = props.getProperty("SHUANGYUN_ADMIN_TOKEN") || "";

  const testPayload = {
    brandName: "測試品牌（Google Form）",
    industry: "測試產業",
    primaryGoal: "測試 Google Form → Platform 串接",
    targetAudience: "測試受眾",
    keyOffer: "測試核心提案",
    toneOfVoice: "專業、親切",
    bannedTopics: "測試禁區",
    preferredChannels: ["Instagram", "LINE"],
    contentCadence: "每週 3 篇",
    campaignWindow: "2026-04-01 to 2026-06-30",
    currentPainPoint: "測試痛點",
    successMetric: "測試指標",
    ownerName: "測試人",
    ownerEmail: "test@example.com"
  };

  const response = UrlFetchApp.fetch(platformUrl + "/api/onboarding", {
    method: "POST",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + adminToken,
      "X-Confirm-Cost": "true"
    },
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  });

  Logger.log("Status: " + response.getResponseCode());
  Logger.log("Body: " + response.getContentText());
}
