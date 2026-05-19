import { redirect } from "next/navigation";

export default function LoreEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Redirect to wiki with the entity ID as a search param
  // The wiki page will handle loading the entity if it exists there
  redirect("/wiki");
}
