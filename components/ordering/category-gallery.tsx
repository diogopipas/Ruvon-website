import Image from "next/image";

const catalogCategories = [
  {
    id: "packs",
    name: "Packs",
    color: "#efb735",
    images: ["/images/packs/classica.webp"],
  },
  {
    id: "amo",
    name: "A.M.O.",
    color: "#dfc6d8",
    images: [
      "/images/amo/borboletas.png",
      "/images/amo/most-wanted.png",
      "/images/amo/alley-cat.png",
    ],
  },
  {
    id: "todos",
    name: "Avulso",
    color: "#ece7d9",
    images: [
      "/images/products/coca-cola.webp",
      "/images/products/super-bock-mini-6.webp",
      "/images/products/doritos.webp",
    ],
  },
  {
    id: "cerveja",
    name: "Cerveja",
    color: "#dfb968",
    images: ["/images/products/super-bock-mini-6.webp"],
  },
  {
    id: "cidra",
    name: "Somersby / Cidra",
    color: "#cbd19a",
    images: ["/images/products/somersby.webp"],
  },
  {
    id: "spirits",
    name: "Destilados",
    color: "#c8b7cf",
    images: ["/images/products/gin.webp", "/images/products/eristoff.webp"],
  },
  {
    id: "vinho",
    name: "Vinho",
    color: "#e5c8c5",
    images: [
      "/images/products/vinho-tinto.webp",
      "/images/products/mateus.webp",
    ],
  },
  {
    id: "gelo-mixers",
    name: "Gelo & Mixers",
    color: "#b8d7dd",
    images: [
      "/images/products/gelo-2kg.webp",
      "/images/products/coca-cola.webp",
    ],
  },
  {
    id: "snacks",
    name: "Snacks",
    color: "#e1b37d",
    images: ["/images/products/doritos.webp", "/images/products/pringles.webp"],
  },
  {
    id: "festa",
    name: "Extras",
    color: "#c8c995",
    images: [
      "/images/products/ruvon-copos.webp",
      "/images/products/baralho.webp",
    ],
  },
];

export function CategoryGallery({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="catalog-category-grid" aria-label="Categorias de produtos">
      {catalogCategories.map(({ id, name, color, images }) => (
        <button
          type="button"
          key={id}
          className={`catalog-category-card catalog-category-card--${id}`}
          style={{ "--category-color": color } as React.CSSProperties}
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
        >
          <span
            className={`catalog-category-art catalog-category-art--${images.length}`}
            aria-hidden="true"
          >
            {images.map((src) => (
              <Image
                key={src}
                src={src}
                alt=""
                width={400}
                height={400}
                sizes="(max-width: 600px) 44vw, (max-width: 800px) 30vw, 280px"
              />
            ))}
          </span>
          {active === id && (
            <span className="catalog-category-selected" aria-hidden="true">
              Selecionada
            </span>
          )}
          <span className="catalog-category-name">{name}</span>
        </button>
      ))}
    </nav>
  );
}
