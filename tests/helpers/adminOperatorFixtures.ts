import path from "node:path";

const PRODUCT_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAABMUlEQVR4nO3RMQ0AMQzAwHIKlvCH8q8uBXHycCbgs7tfXOdmZgJqMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMK7BuAbjGoxrMO4NjusH4+9o75iQFDQAAAAASUVORK5CYII=";

export function getOperatorProductImageUpload() {
  return {
    name: "stanley-quencher-h2-0-40oz.png",
    mimeType: "image/png",
    buffer: Buffer.from(PRODUCT_IMAGE_BASE64, "base64"),
  };
}

export function getWrapArtworkFixturePath(): string {
  return path.join(process.cwd(), "src", "__tests__", "fixtures", "wrap-test.svg");
}
