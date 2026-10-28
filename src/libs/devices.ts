const STORAGE_KEY = "phoenyx.device.id";

export type DeviceSnapshot = {
  clientId: string;
  fingerprint: string;
  components: Record<string, string | number | boolean>;
  userAgent: string;
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    brands?: Array<{ brand: string; version: string }>;
  };
  capturedAt: string;
};

function getOrCreateClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function canvasHash(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("device-probe-🎯", 2, 15);
    return sha256(canvas.toDataURL());
  } catch {
    return "canvas-error";
  }
}

function webglInfo(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return { vendor: "none", renderer: "none" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) {
      return {
        vendor: String(gl.getParameter(gl.VENDOR)),
        renderer: String(gl.getParameter(gl.RENDERER)),
      };
    }
    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
    };
  } catch {
    return { vendor: "error", renderer: "error" };
  }
}

export async function collectDevice(): Promise<DeviceSnapshot> {
  const uaData = (navigator as unknown as { userAgentData?: any })
    .userAgentData;
  const gl = webglInfo();
  const components: Record<string, string | number | boolean> = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: (navigator.languages ?? []).join(","),
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    dpr: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    deviceMemory:
      (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0,
    touch: navigator.maxTouchPoints > 0,
    canvas: await canvasHash(),
    webglVendor: gl.vendor,
    webglRenderer: gl.renderer,
    uaPlatform: uaData?.platform ?? "",
    uaMobile: Boolean(uaData?.mobile),
  };

  return {
    clientId: getOrCreateClientId(),
    fingerprint: await sha256(JSON.stringify(components)),
    components,
    userAgent: navigator.userAgent,
    userAgentData: uaData
      ? {
          platform: uaData.platform,
          mobile: uaData.mobile,
          brands: uaData.brands,
        }
      : undefined,
    capturedAt: new Date().toISOString(),
  };
}
