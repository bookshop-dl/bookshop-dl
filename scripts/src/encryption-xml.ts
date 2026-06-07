export interface EncryptedResource {
  uri: string;
  compressionMethod: number;
  originalLength?: number;
}

export function parseEncryptionXml(xml: string): EncryptedResource[] {
  const resources: EncryptedResource[] = [];
  const encryptedDataBlocks = xml.match(
    /<EncryptedData[\s\S]*?<\/EncryptedData>/g,
  );

  if (!encryptedDataBlocks?.length) {
    return resources;
  }

  for (const block of encryptedDataBlocks) {
    const uriMatch = block.match(/<CipherReference[^>]*URI="([^"]+)"/);
    if (!uriMatch?.[1]) continue;

    const methodMatch = block.match(
      /<Compression[^>]*Method="(\d+)"(?:[^>]*OriginalLength="(\d+)")?/,
    );
    const compressionMethod = methodMatch ? Number(methodMatch[1]) : 0;
    const originalLength = methodMatch?.[2]
      ? Number(methodMatch[2])
      : undefined;

    resources.push({
      uri: uriMatch[1],
      compressionMethod,
      originalLength,
    });
  }

  return resources;
}
