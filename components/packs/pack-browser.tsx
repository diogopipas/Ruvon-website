"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { packs, productById } from "@/lib/products";
import {
  fitsGroup,
  configurePack,
  packEvent,
  packOptions,
  type GroupSize,
} from "@/lib/packs";
import { money } from "@/lib/pricing";
import { track, trackOnce } from "@/lib/analytics";
import { useCart } from "@/components/providers";
import { Modal } from "@/components/ui/modal";
import { Quantity } from "@/components/cart/quantity";
import { ProductArt } from "@/components/ui/product-art";
import type { Pack } from "@/types";
import { PackOptionsPicker } from "./pack-options-picker";

function recordPackView(pack: Pack) {
  trackOnce(
    "product_viewed",
    { product: pack.id, category: "packs", ...packEvent(pack.id) },
    `product_viewed:${pack.id}`,
  );
}
function PackProduct({ pack, onChoose }: { pack: Pack; onChoose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { items, ageConfirmed } = useCart();
  const item = items.find((item) => item.id === pack.id);
  const quantity = item?.quantity ?? 0;
  const configured = configurePack(pack, item?.options);
  useEffect(() => {
    if (!ageConfirmed) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          recordPackView(pack);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [pack, ageConfirmed]);
  return (
    <article
      className={`pack-product ${pack.id} ${quantity ? "has-pack" : ""}`}
      style={{ "--pack-stage": pack.color } as React.CSSProperties}
    >
      <button
        ref={ref}
        className="pack-photo"
        onClick={() => {
          recordPackView(pack);
          onChoose();
        }}
        aria-label={`Ver ${pack.name}`}
        disabled={!ageConfirmed}
      >
        <Image
          src={pack.image}
          alt={`Composição ilustrativa de ${pack.name}`}
          width={1200}
          height={800}
          sizes="(max-width: 700px) 92vw, 50vw"
        />
      </button>
      <div className="pack-receipt">
        <span className="pack-audience">
          {pack.people}
          {pack.id === "pack-sem-ressacas" ? " · Sem álcool" : ""}
        </span>
        <h3>{pack.name}</h3>
        <p className="pack-core-value">{pack.summary}</p>
        <p className="pack-line">{pack.description}</p>
        <p className="pack-summary">
          {quantity
            ? "Marcas e extras à tua maneira."
            : "Extras incluídos. Troca ou retira o que não precisas."}
        </p>
        <div className="pack-buy">
          <div>
            <small className="pack-price-label">
              {quantity ? "Na tua versão" : "Com extras"}
            </small>
            <strong>{money(configured.price)}</strong>
          </div>
          <button
            className="button button-primary"
            onClick={() => {
              recordPackView(pack);
              onChoose();
            }}
            disabled={!ageConfirmed}
          >
            {quantity ? `Editar pack · ${quantity}` : "Escolher pack"}
          </button>
        </div>
      </div>
    </article>
  );
}
const addOnIds = [
  "gelo",
  "super-bock",
  "somersby",
  "coca-cola",
  "red-bull",
  "agua",
  "doritos",
  "copos",
];
export function PackAddOns() {
  return (
    <section className="pack-addons" aria-label="Extras para o pack">
      <h3>Falta alguma coisa?</h3>
      <div className="addon-list">
        {addOnIds.map((id) => {
          const product = productById.get(id)!;
          return (
            <div className="addon" key={id}>
              <ProductArt product={product} />
              <div>
                <strong>{product.name}</strong>
                <small>
                  {product.size} · {money(product.price)}
                </small>
              </div>
              <Quantity id={id} name={product.name} compact />
            </div>
          );
        })}
      </div>
    </section>
  );
}
function PackDetail({ pack, onClose }: { pack: Pack; onClose: () => void }) {
  const { items, add, updateOptions, openCart, ageConfirmed } = useCart();
  const existing = items.find((item) => item.id === pack.id);
  const [options, setOptions] = useState(() =>
    packOptions(pack, existing?.options),
  );
  const configured = configurePack(pack, options);
  const [added, setAdded] = useState(false);
  const guard = useRef(false);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={pack.name}
      className={`pack-detail ${added ? "pack-added" : ""}`}
    >
      {added ? (
        <>
          <p className="pack-confirmation" role="status">
            Está no carrinho. A noite já tem plano.
          </p>
          <PackAddOns />
          <button
            className="button button-primary"
            onClick={() => {
              onClose();
              openCart();
            }}
          >
            Ver carrinho
          </button>
          <button className="button button-secondary" onClick={onClose}>
            Continuar a explorar
          </button>
        </>
      ) : (
        <>
          <div className="pack-detail-photo" style={{ background: pack.color }}>
            <Image
              src={pack.image}
              alt={`Composição ilustrativa de ${pack.name}`}
              width={1200}
              height={800}
              sizes="(max-width: 700px) 90vw, 600px"
            />
          </div>
          <div className="pack-detail-heading">
            <span>{pack.people}</span>
            <strong>{money(configured.price)}</strong>
          </div>
          <p>{pack.description}</p>
          <PackOptionsPicker
            pack={pack}
            value={options}
            onChange={setOptions}
          />
          <br />
          <button
            className="button button-primary pack-detail-cta"
            disabled={!ageConfirmed}
            onClick={() => {
              if (guard.current) return;
              guard.current = true;
              if (existing) {
                updateOptions(pack.id, options);
                onClose();
              } else {
                add(pack.id, options);
                setAdded(true);
              }
            }}
          >
            {`${existing ? "Atualizar pack" : "Adicionar"} · ${money(configured.price)}`}
          </button>
        </>
      )}
    </Modal>
  );
}
export function PackBrowser({ featured = false }: { featured?: boolean }) {
  const [group, setGroup] = useState<GroupSize>("all");
  const [selected, setSelected] = useState<Pack | null>(null);
  const sorted = [...packs].sort(
    (a, b) =>
      Number(b.id === "pack-classica") - Number(a.id === "pack-classica") ||
      Number(b.tier === "primary") - Number(a.tier === "primary"),
  );
  const visible = sorted
    .filter(
      (pack) =>
        fitsGroup(pack, group) && (!featured || pack.tier === "primary"),
    )
    .slice(0, packs.length);
  return (
    <div
      className={`pack-browser ${featured ? "featured-packs" : "all-packs"}`}
    >
      <span className="sr-only" role="status">
        {visible.length === 1
          ? "1 pack disponível para este grupo."
          : `${visible.length} packs disponíveis para este grupo.`}
      </span>
      <div className="group-discovery">
        <div>
          <h3>Quantos são?</h3>
        </div>
        <div className="group-choices" aria-label="Tamanho do grupo">
          {(
            [
              ["all", "Todos"],
              ["2-3", "2–3"],
              ["4-6", "4–6"],
              ["7+", "7+"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={group === value}
              onClick={() => {
                if (group !== value) {
                  setGroup(value);
                  track("pack_group_selected", {
                    group_size: value,
                    source: featured ? "landing" : "catalog",
                  });
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {group === "7+" && (
        <p className="group-hint">
          A Clássica dá para 5–7. São mais? Junta outro pack ou os extras que
          faltam.
        </p>
      )}
      <div className="pack-menu">
        {visible
          .filter((pack) => pack.tier === "primary")
          .map((pack) => (
            <PackProduct
              key={pack.id}
              pack={pack}
              onChoose={() => setSelected(pack)}
            />
          ))}
      </div>
      {!featured && visible.some((pack) => pack.tier === "secondary") && (
        <section className="secondary-packs" aria-label="Mais dois packs">
          <h2>Outra bebida? Também há.</h2>
          <p>Gin ou sem álcool. A mesma ideia, à tua maneira.</p>
          <div className="pack-menu">
            {visible
              .filter((pack) => pack.tier === "secondary")
              .map((pack) => (
                <PackProduct
                  key={pack.id}
                  pack={pack}
                  onChoose={() => setSelected(pack)}
                />
              ))}
          </div>
        </section>
      )}
      {featured && (
        <Link href="/pedir" className="button button-secondary all-packs-link">
          Ver todos os packs
        </Link>
      )}
      {selected && (
        <PackDetail
          key={selected.id}
          pack={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
