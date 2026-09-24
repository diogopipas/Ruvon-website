"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { packs, productById } from "@/lib/products";
import {
  fitsGroup,
  optionChoices,
  optionLabels,
  packContents,
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
import type { Pack, PackOptions } from "@/types";

export function PackOptionsPicker({
  pack,
  value,
  onChange,
  disabled = false,
}: {
  pack: Pack;
  value: PackOptions;
  onChange: (value: PackOptions) => void;
  disabled?: boolean;
}) {
  return pack.options?.map((key) => (
    <fieldset className="pack-option" key={key} disabled={disabled}>
      <legend>{optionLabels[key]}</legend>
      <div>
        {optionChoices[key].map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={value[key] === choice.value}
            onClick={() => onChange({ ...value, [key]: choice.value })}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  ));
}
function PackProduct({ pack, onChoose }: { pack: Pack; onChoose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { items, ageConfirmed } = useCart();
  const quantity = items.find((item) => item.id === pack.id)?.quantity ?? 0;
  useEffect(() => {
    if (!ageConfirmed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackOnce(
            "product_viewed",
            { product: pack.id, category: "packs", ...packEvent(pack.id) },
            `product_viewed:${pack.id}`,
          );
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [pack, ageConfirmed]);
  return (
    <article
      ref={ref}
      className={`pack-product ${pack.id} ${quantity ? "has-pack" : ""}`}
      style={{ "--pack-stage": pack.color } as React.CSSProperties}
    >
      <button
        className="pack-photo"
        onClick={onChoose}
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
        <p className="pack-line">{pack.description}</p>
        <p className="pack-summary">{pack.summary}</p>
        <div className="pack-buy">
          <strong>{money(pack.price)}</strong>
          <button
            className="button button-primary"
            onClick={onChoose}
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
            <strong>{money(pack.price)}</strong>
          </div>
          <p>{pack.description}</p>
          <h3>Está tudo aqui.</h3>
          <ul className="pack-full-contents">
            {packContents(pack, options).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <PackOptionsPicker
            pack={pack}
            value={options}
            onChange={setOptions}
          />
          <p className="pack-preview">
            Imagem ilustrativa. Preço de antevisão. Ainda sem entregas ou
            pagamento.
          </p>
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
            {existing ? "Atualizar pack" : `Adicionar · ${money(pack.price)}`}
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
      Number(!!b.featured) - Number(!!a.featured),
  );
  const visible = sorted
    .filter(
      (pack) =>
        fitsGroup(pack, group) &&
        (!featured || group !== "all" || pack.featured),
    )
    .slice(0, featured ? 3 : packs.length);
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
          <p>Tu dizes quantos são. A Jola trata do resto.</p>
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
        {visible.map((pack) => (
          <PackProduct
            key={pack.id}
            pack={pack}
            onChoose={() => setSelected(pack)}
          />
        ))}
      </div>
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
