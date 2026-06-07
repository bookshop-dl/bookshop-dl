export interface LcpLicense {
  provider?: string;
  id?: string;
  issued?: string;
  encryption?: {
    profile?: string;
    content_key?: {
      algorithm?: string;
      encrypted_value?: string;
    };
    user_key?: {
      algorithm?: string;
      text_hint?: string;
      key_check?: string;
    };
  };
  links?: Array<{
    rel: string;
    href: string;
    type?: string;
    title?: string;
    length?: number;
    hash?: string;
  }>;
  user?: unknown;
  rights?: unknown;
  signature?: unknown;
  [key: string]: unknown;
}

export interface DigitalBook {
  sku: string;
  checksum: string;
  purchased_at?: string;
  product?: {
    title?: string;
    subtitle?: string;
    cover_url?: string;
    is_drm_free?: boolean;
    contributors?: Array<{ full_name?: string; role?: string }>;
  };
}

export interface LibraryResponse {
  digital_books?: DigitalBook[];
}

export interface DeviceRegistration {
  id: string;
  deviceName?: string;
}

export interface DeviceValidateResponse {
  is_valid: boolean;
}

export interface UserKeyResponse {
  key: string;
}
