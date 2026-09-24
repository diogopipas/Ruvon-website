import { useId } from "react";
import Image from "next/image";
import { productImages } from "@/lib/product-images";
import type { Product } from "@/types";
export function ProductArt({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const photo = productImages[product.id];
  if (photo)
    return (
      <Image
        src={photo}
        alt=""
        aria-hidden="true"
        width={400}
        height={600}
        className={`product-art product-packshot ${className}`}
        sizes="(max-width: 700px) 42vw, 240px"
      />
    );
  const { art, color, label } = product;
  const bottle =
    art === "beer" || art === "wine" || art === "spirit" || art === "soda";
  return (
    <svg
      viewBox="0 0 180 190"
      className={`product-art ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" x2="1">
          <stop stopColor={art === "beer" ? "#442717" : color} />
          <stop
            offset=".34"
            stopColor={art === "beer" ? "#8c5928" : "#e1e0c4"}
          />
          <stop offset=".5" stopColor={art === "beer" ? "#6d401c" : color} />
          <stop offset="1" stopColor={art === "beer" ? "#2c2016" : "#35423a"} />
        </linearGradient>
        <linearGradient id={`${id}-shine`}>
          <stop stopColor="#fff" stopOpacity=".36" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity=".04" />
          <stop offset="1" stopColor="#000" stopOpacity=".24" />
        </linearGradient>
        <linearGradient id={`${id}-ice`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#edfaff" />
          <stop offset="1" stopColor="#7ba9c6" />
        </linearGradient>
      </defs>
      <ellipse cx="92" cy="173" rx="46" ry="7" fill="#000" opacity=".12" />
      {bottle && (
        <g
          transform={art === "beer" ? "rotate(-9 90 100)" : "rotate(7 90 100)"}
        >
          {art === "beer" && (
            <g opacity=".6" transform="translate(26 -4)">
              <path
                d="M70 32h23v33q0 8 12 17v83q0 9-9 9H64q-9 0-9-9V82q15-10 15-18z"
                fill={`url(#${id}-glass)`}
              />
              <rect x="56" y="105" width="47" height="37" rx="1" fill={color} />
              <rect x="68" y="27" width="28" height="9" rx="2" fill="#c8b983" />
            </g>
          )}
          <path
            d={
              art === "spirit"
                ? "M74 29h32v33q0 8 13 16v85q0 11-10 11H69q-10 0-10-11V78q15-8 15-16z"
                : "M77 24h24v41q0 7 12 18v79q0 12-12 12H75q-12 0-12-12V83q14-12 14-18z"
            }
            fill={`url(#${id}-glass)`}
          />
          <rect
            x="75"
            y="18"
            width="28"
            height="10"
            rx="2"
            fill={art === "beer" ? "#c7b282" : color}
          />
          <path
            d="M80 34v33q0 10-10 19v69"
            stroke="#fff"
            strokeWidth="3"
            opacity=".2"
            fill="none"
          />
          <rect
            x={art === "spirit" ? "61" : "64"}
            y="98"
            width={art === "spirit" ? "57" : "48"}
            height="46"
            rx="2"
            fill={art === "soda" ? color : "#f4ebd6"}
          />
          {art === "beer" && <circle cx="88" cy="120" r="18" fill={color} />}
          <text
            x="89"
            y="119"
            fill={art === "beer" || art === "soda" ? "#fff7e8" : "#2c3027"}
            textAnchor="middle"
            fontFamily="Arial,sans-serif"
            fontSize={label.length > 12 ? "5.5" : "7"}
            fontWeight="900"
          >
            {label.includes("SUPER BOCK") ? "SUPER" : label}
          </text>
          {label.includes("SUPER BOCK") && (
            <text
              x="89"
              y="127"
              fill="#fff7e8"
              textAnchor="middle"
              fontFamily="Arial"
              fontSize="8"
              fontWeight="900"
            >
              BOCK
            </text>
          )}
          <path d="M77 136h23" stroke={color} opacity=".7" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              cx={72 + i * 8}
              cy={88 + (i % 2) * 65}
              r="1.5"
              fill="#fff"
              opacity=".35"
            />
          ))}
        </g>
      )}
      {art === "ice" && (
        <g transform="rotate(8 90 100)">
          <path
            d="M63 34l29 10 26-9-8 24 18 19 8 86q-44 15-90-1l7-85 17-19z"
            fill={`url(#${id}-ice)`}
            stroke="#bfd7e2"
            strokeWidth="2"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={59 + (i % 3) * 20}
              y={75 + Math.floor(i / 3) * 37}
              width="29"
              height="30"
              rx="7"
              fill="#f5fdff"
              fillOpacity=".5"
              stroke="#fff"
              transform={`rotate(${i * 9 - 15} ${73 + (i % 3) * 20} ${90 + Math.floor(i / 3) * 37})`}
            />
          ))}
          <path d="M54 111h74v34H54z" fill="#337696" opacity=".92" />
          <text
            x="90"
            y="133"
            fill="white"
            fontFamily="Arial"
            fontSize="21"
            fontWeight="900"
            textAnchor="middle"
          >
            {label}
          </text>
          <path d="M76 52l26 5" stroke="#4e859a" strokeWidth="5" />
        </g>
      )}
      {art === "chips" && (
        <g transform="rotate(-8 90 100)">
          <path
            d="M50 40q42 7 79 0l-5 20 12 95 2 16q-46-5-91 1l4-20 8-90z"
            fill={color}
          />
          <path
            d="M50 40q42 7 79 0M47 169q48-7 91 0"
            stroke="#fff"
            strokeOpacity=".45"
            strokeWidth="4"
          />
          <path
            d="M50 40q42 7 79 0l-5 20 12 95 2 16q-46-5-91 1l4-20 8-90z"
            fill={`url(#${id}-shine)`}
          />
          <text
            x="91"
            y="88"
            textAnchor="middle"
            fill="#fff9e8"
            fontFamily="Arial"
            fontSize={label.length > 9 ? 11 : 20}
            fontWeight="900"
            fontStyle="italic"
          >
            {label}
          </text>
          <path
            d="M85 107l-21 37 47-7zM105 108l-9 36 30-10z"
            fill="#eecb79"
            stroke="#c99235"
            strokeWidth="2"
          />
          <path
            d="M81 115l-8 20M108 119l-3 14"
            stroke="#d6a24c"
            strokeWidth="2"
          />
        </g>
      )}
      {(art === "can" || art === "tube") && (
        <g transform="rotate(-8 90 100)">
          <rect
            x="63"
            y={art === "can" ? 45 : 29}
            width="57"
            height={art === "can" ? 122 : 139}
            rx="9"
            fill={color}
          />
          <rect
            x="63"
            y={art === "can" ? 45 : 29}
            width="57"
            height={art === "can" ? 122 : 139}
            rx="9"
            fill={`url(#${id}-shine)`}
          />
          <ellipse
            cx="91"
            cy={art === "can" ? 47 : 31}
            rx="28"
            ry="6"
            fill="#d4d1c7"
          />
          <ellipse
            cx="91"
            cy={art === "can" ? 47 : 31}
            rx="23"
            ry="3"
            fill="#9e9d95"
          />
          {art === "can" && <path d="M90 53h25v108H90z" fill="#d8d9d8" />}
          <text
            x="90"
            y="104"
            textAnchor="middle"
            fill={art === "can" ? "#be252c" : "#fff5d9"}
            fontWeight="900"
            fontFamily="Arial"
            fontSize="12"
          >
            {label}
          </text>
          <ellipse cx="91" cy="165" rx="26" ry="4" fill="#dad7c8" />
        </g>
      )}
      {art === "cups" && (
        <g>
          {[0, 1, 2].map((i) => (
            <g
              key={i}
              transform={`translate(${i * 8 - 8} ${-i * 7}) rotate(-9 90 100)`}
            >
              <path
                d="M58 70h65l-11 89q-23 10-44 0z"
                fill={color}
                stroke="#eedfd0"
                strokeWidth="2"
              />
              <ellipse cx="90" cy="70" rx="33" ry="7" fill="#f5ebd9" />
              <path
                d="M75 112l28 14M75 129l28 14"
                stroke="#e5bb7f"
                strokeWidth="8"
              />
            </g>
          ))}
        </g>
      )}
      {art === "lime" && (
        <g>
          <ellipse
            cx="74"
            cy="118"
            rx="36"
            ry="28"
            fill="#648b29"
            transform="rotate(-30 74 118)"
          />
          <ellipse
            cx="105"
            cy="135"
            rx="30"
            ry="29"
            fill="#d0dc6c"
            stroke="#59802c"
            strokeWidth="6"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d="M105 135l23-4-12-16z"
              fill="#9fbd4f"
              stroke="#e3e89f"
              transform={`rotate(${i * 60} 105 135)`}
            />
          ))}
        </g>
      )}
      {art === "napkins" && (
        <g transform="rotate(-15 90 105)">
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={49 + i * 3}
              y={78 - i * 5}
              width="82"
              height="77"
              rx="1"
              fill="#eee5d3"
              stroke="#cfc5b1"
            />
          ))}
          <text
            x="94"
            y="113"
            textAnchor="middle"
            fontWeight="900"
            fontSize="12"
            fill="#7e785f"
          >
            JOLA
          </text>
        </g>
      )}
      {art === "opener" && (
        <g transform="rotate(30 90 100)">
          <rect x="82" y="82" width="19" height="87" rx="9" fill="#a5aaa4" />
          <rect x="70" y="36" width="43" height="65" rx="18" fill="#c2c6bf" />
          <rect x="80" y="47" width="23" height="32" rx="6" fill="#737970" />
          <path d="M80 73h23" stroke="#e6e7df" strokeWidth="8" />
        </g>
      )}
      {art === "cards" && (
        <g transform="rotate(13 90 100)">
          <rect
            x="51"
            y="53"
            width="78"
            height="112"
            rx="5"
            fill="#fff6e1"
            stroke="#b9b19e"
          />
          <rect x="59" y="61" width="62" height="96" rx="3" fill={color} />
          <path d="M89 85l18 26-18 26-18-26z" fill="#e3c590" />
          <text
            x="91"
            y="116"
            fontFamily="Arial"
            fontWeight="900"
            fontSize="15"
            textAnchor="middle"
            fill={color}
          >
            J
          </text>
        </g>
      )}
    </svg>
  );
}
