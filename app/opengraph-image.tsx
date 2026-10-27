import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const alt = "Ruvon — Acabou a bebida? Nós levamos.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image() {
  const logo = await readFile(
    path.join(process.cwd(), "public/images/brand/ruvon-logo.svg"),
  );
  const font = await readFile(
    path.join(
      process.cwd(),
      "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff",
    ),
  );
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#171815",
        color: "#f4eedf",
        display: "flex",
        padding: "58px 70px",
        flexDirection: "column",
        fontFamily: "Barlow",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <img
          src={`data:image/svg+xml;base64,${logo.toString("base64")}`}
          alt="Ruvon"
          width={260}
          height={52}
        />
        <span style={{ fontSize: 26, color: "#bbc2a6" }}>ruvon.store</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 112,
          lineHeight: 1,
          marginTop: 38,
        }}
      >
        <span>Acabou a bebida?</span>
        <span style={{ color: "#efb735" }}>Nós levamos.</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 29,
          marginTop: 35,
          color: "#bfc5ad",
        }}
      >
        Bebidas geladas. Gelo. Snacks. A festa continua.
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 17,
          background: "#efb735",
          display: "flex",
        }}
      />
    </div>,
    {
      ...size,
      fonts: [{ name: "Barlow", data: font, weight: 800, style: "normal" }],
    },
  );
}
