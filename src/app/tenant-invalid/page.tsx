import { notFound } from "next/navigation";

// Middleware rewrites any unresolved/invalid tenant request here. Calling
// notFound() renders the sibling not-found.tsx AND makes the real HTTP
// response status 404 (a plain page component can't set that directly).
export default function TenantInvalidPage() {
  notFound();
}
