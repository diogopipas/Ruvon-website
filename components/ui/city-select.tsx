import type { SelectHTMLAttributes } from "react";

const cities = ["Faro", "Lisboa", "Porto", "Coimbra", "Braga", "Outra zona"];

/** Keep previously saved cities selectable when an existing journey resumes. */
export function CitySelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const selected = String(props.value ?? props.defaultValue ?? "");
  return (
    <select name="city" autoComplete="address-level2" required {...props}>
      <option value="" disabled>
        Seleciona a tua zona
      </option>
      {cities.map((city) => (
        <option key={city} value={city}>
          {city}
        </option>
      ))}
      {selected && !cities.includes(selected) && (
        <option value={selected}>{selected}</option>
      )}
    </select>
  );
}
