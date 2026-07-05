"use client";

import { useRef, useState } from "react";
import { ShowForm, type ShowFormInitial } from "./show-form";
import { ImportPanel, type ImportedShow } from "./import-panel";

/**
 * New-show flow: an optional "import a tour date" panel above the show form.
 * Picking a date remounts the form (via key) with the venue/city/date/time
 * prefilled, so the label only fills in the economics.
 */
export function ImportableShowForm({
  artists,
  tours,
  depositTemplates,
  baseInitial,
}: {
  artists: { id: string; name: string }[];
  tours: { id: string; name: string; artistId: string }[];
  depositTemplates: number[];
  baseInitial: ShowFormInitial;
}) {
  const [initial, setInitial] = useState<ShowFormInitial>(baseInitial);
  const [version, setVersion] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);

  const handleImport = (show: ImportedShow) => {
    setInitial({
      ...baseInitial,
      artistId: show.artistId,
      venueName: show.venueName,
      venueCity: show.venueCity,
      venueState: show.venueState,
      date: show.date,
      startTime: show.startTime ?? baseInitial.startTime,
    });
    setVersion((v) => v + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      {artists.length > 0 ? <ImportPanel artists={artists} onImport={handleImport} /> : null}
      <div ref={formRef}>
        <ShowForm
          key={version}
          artists={artists}
          tours={tours}
          depositTemplates={depositTemplates}
          initial={initial}
        />
      </div>
    </div>
  );
}
