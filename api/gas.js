module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Chỉ chấp nhận POST." });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  const apiSecret = process.env.GAS_API_SECRET;
  if (!gasUrl || !apiSecret) {
    return response.status(500).json({ error: "Thiếu cấu hình GAS_WEB_APP_URL hoặc GAS_API_SECRET trên Vercel." });
  }

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return response.status(400).json({ error: "Nội dung yêu cầu phải là JSON hợp lệ." });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response.status(400).json({ error: "Nội dung yêu cầu không hợp lệ." });
  }

  let endpoint;
  try {
    endpoint = new URL(gasUrl);
    if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !endpoint.pathname.endsWith("/exec")) {
      throw new Error("URL");
    }
  } catch (error) {
    return response.status(500).json({ error: "GAS_WEB_APP_URL phải là URL HTTPS của Apps Script kết thúc bằng /exec." });
  }

  try {
    const gasResponse = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        action: body.action,
        token: body.token,
        key: body.key,
        submission: body.submission,
        apiSecret: apiSecret
      })
    });
    const raw = await gasResponse.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        "Apps Script không trả JSON. Kiểm tra URL /exec, quyền truy cập Anyone và phiên bản Web App đã deploy."
      );
    }

    if (!gasResponse.ok) {
      return response.status(502).json({ error: "Apps Script gặp lỗi HTTP " + gasResponse.status + "." });
    }
    if (!result.ok) {
      const message = String(result.error || "Apps Script xử lý yêu cầu thất bại.");
      const status = message === "API không được cấp quyền." ? 401 : 400;
      return response.status(status).json({ error: message });
    }
    return response.status(200).json(result);
  } catch (error) {
    return response.status(502).json({
      error: error && error.name === "TimeoutError"
        ? "Apps Script phản hồi quá chậm. Hãy thử lại sau ít phút."
        : error && error.message ? error.message : "Không thể kết nối tới Apps Script."
    });
  }
};
