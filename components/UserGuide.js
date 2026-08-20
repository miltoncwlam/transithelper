'use client';

import { GUIDE } from '../lib/guide.js';

export default function UserGuide({ lang }) {
  const guide = GUIDE[lang] || GUIDE.zh;
  return (
    <div className="guide">
      <h2 className="text-lg font-bold">{guide.title}</h2>
      <p className="muted mt-2">{guide.intro}</p>
      <p className="mt-3">
        <a className="tab" href="/user-manual.pdf" target="_blank" rel="noreferrer">{guide.pdf}</a>
      </p>
      {guide.sections.map((section) => (
        <div key={section.h} className="mt-4">
          <h3 className="font-bold">{section.h}</h3>
          {section.p.map((para) => <p key={para.slice(0, 24)} className="muted mt-2">{para}</p>)}
        </div>
      ))}
    </div>
  );
}
