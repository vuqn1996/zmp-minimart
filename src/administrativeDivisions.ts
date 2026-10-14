export interface AdministrativeDivision {
  code: number;
  name: string;
}

export interface AdministrativeProvince extends AdministrativeDivision {
  wards: AdministrativeDivision[];
}

export async function loadVietnamAdministrativeDivisions(): Promise<AdministrativeProvince[]> {
  return (await import("./data/vietnam-administrative-divisions.json")).default as AdministrativeProvince[];
}

export function administrativeNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/^(tinh|thanh pho|phuong|xa|dac khu|thi tran)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi");
}

export function canonicalProvinceName(name: string, provinces: AdministrativeProvince[]): string {
  const key = administrativeNameKey(name);
  return provinces.find((province) => administrativeNameKey(province.name) === key)?.name ?? "";
}

export function canonicalWardName(name: string, wards: AdministrativeDivision[]): string {
  const keys = name.split(",").map(administrativeNameKey);
  return wards.find((ward) => keys.includes(administrativeNameKey(ward.name)))?.name ?? "";
}
