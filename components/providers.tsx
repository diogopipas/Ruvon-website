"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Check, ShoppingBag } from "lucide-react";
import {
  attribution,
  captureAttribution,
  getSession,
  readLocal,
  track,
  writeLocal,
} from "@/lib/analytics";
import { getCatalogItem } from "@/lib/products";
import { priceBasket } from "@/lib/pricing";
import { cartSchema, locationSchema } from "@/lib/validation";
import { Modal } from "@/components/ui/modal";
import type { CartItem, Location } from "@/types";
type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  location: Location | null;
  setLocation: (location: Location) => void;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  notify: (message: string) => void;
  syncOrder: (checkout?: boolean, delivery?: Location) => Promise<void>;
  storageError: boolean;
};
const CartContext = createContext<CartContextValue | null>(null);
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("CartProvider missing");
  return context;
}
export function Providers({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [location, setDelivery] = useState<Location | null>(null);
  const [ready, setReady] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const checkoutReached = useRef(false);
  const started = useRef(false);
  useEffect(() => {
    captureAttribution();
    getSession();
    const cart = cartSchema.safeParse(readLocal("jola_cart", []));
    const savedLocation = locationSchema.safeParse(
      readLocal("jola_location", null),
    );
    // Hydrate browser-persisted state once after the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(cart.success ? cart.data : []);
    if (savedLocation.success) setDelivery(savedLocation.data);
    checkoutReached.current = readLocal("jola_checkout_started", false);
    started.current = !!cart.success && cart.data.length > 0;
    setAgeOpen(readLocal<boolean>("jola_age", false) !== true);
    setReady(true);
  }, []);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const syncOrder = useCallback(
    (checkout = false, delivery?: Location) => {
      if (checkout) {
        checkoutReached.current = true;
        writeLocal("jola_checkout_started", true);
      }
      const payload = {
        session_id: getSession(),
        items,
        location: delivery ?? location ?? undefined,
        attribution: attribution(),
        reached_checkout: checkoutReached.current,
      };
      const task = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
          });
          if (!response.ok) {
            setStorageError(true);
            throw new Error(
              "Não conseguimos guardar o pedido. Tenta novamente.",
            );
          }
          setStorageError(false);
        });
      writeQueue.current = task;
      return task;
    },
    [items, location],
  );
  useEffect(() => {
    if (!ready) return;
    writeLocal("jola_cart", items);
    if (!started.current && !items.length) return;
    started.current = true;
    const timeout = setTimeout(() => {
      void syncOrder().catch(() => undefined);
    }, 350);
    return () => clearTimeout(timeout);
  }, [items, ready, syncOrder]);
  const add = (id: string) => {
    if (!ready) return;
    const current = items.find((i) => i.id === id);
    if ((current?.quantity ?? 0) >= 30) {
      notify("Máximo de 30 por artigo.");
      return;
    }
    const next = current
      ? items.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
      : [...items, { id, quantity: 1 }];
    setItems(next);
    writeLocal("jola_cart", next);
    const product = getCatalogItem(id)!;
    const priced = priceBasket(next);
    track("product_added", {
      product: id,
      category: "category" in product ? product.category : "packs",
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
      quantity: 1,
    });
    notify(`${product.name} no carrinho`);
  };
  const remove = (id: string) => {
    const next = items.flatMap((i) =>
      i.id !== id
        ? [i]
        : i.quantity > 1
          ? [{ ...i, quantity: i.quantity - 1 }]
          : [],
    );
    setItems(next);
    writeLocal("jola_cart", next);
    const product = getCatalogItem(id);
    const priced = priceBasket(next);
    track("product_removed", {
      product: id,
      category: product && "category" in product ? product.category : "packs",
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
      quantity: 1,
    });
  };
  const setLocation = (value: Location) => {
    setDelivery(value);
    writeLocal("jola_location", value);
  };
  const openCart = () => {
    const priced = priceBasket(items);
    track("cart_opened", {
      basket_value: priced.subtotal / 100,
      item_count: priced.item_count,
    });
    setCartOpen(true);
  };
  const isPrivate =
    pathname.startsWith("/admin") ||
    pathname === "/privacidade" ||
    pathname === "/termos";
  return (
    <MotionConfig reducedMotion="user">
      <CartContext.Provider
        value={{
          items,
          ready,
          add,
          remove,
          location,
          setLocation,
          cartOpen,
          openCart,
          closeCart: () => setCartOpen(false),
          notify,
          syncOrder,
          storageError,
        }}
      >
        {children}
        <Modal
          open={ready && ageOpen && !isPrivate}
          onOpenChange={() => {}}
          title={denied ? "Ficamos por aqui." : "Só uma coisa…"}
          locked
          className="age-modal"
        >
          <div className="age-emblem" aria-hidden="true">
            {denied ? "—" : "18+"}
          </div>
          <h2>
            {denied
              ? "Esta noite é para maiores de 18."
              : "Tens 18 anos ou mais?"}
          </h2>
          <p>
            {denied
              ? "A Jola destina-se a adultos. Não podes continuar para o catálogo."
              : "Boas noites, com responsabilidade. Confirma a tua idade para entrares."}
          </p>
          {!denied ? (
            <>
              <button
                className="button button-primary"
                onClick={() => {
                  writeLocal("jola_age", true);
                  setAgeOpen(false);
                }}
              >
                Sim, tenho 18+ <Check size={18} />
              </button>
              <button
                className="button button-quiet"
                onClick={() => setDenied(true)}
              >
                Não
              </button>
            </>
          ) : (
            <button
              className="button button-secondary"
              onClick={() => setDenied(false)}
            >
              Voltar à confirmação
            </button>
          )}
          <small>Conceito em validação. Sem vendas ou entregas reais.</small>
        </Modal>
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              className="toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <ShoppingBag size={17} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </CartContext.Provider>
    </MotionConfig>
  );
}
