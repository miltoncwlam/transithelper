'use client';

import { GUIDE } from '../lib/guide.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function UserGuide({ lang }) {
  const guide = GUIDE[lang] || GUIDE.zh;
  return (
    <Card className="guide border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <h2 className="text-lg font-bold">{guide.title}</h2>
      </CardHeader>
      <CardContent className="px-0">
        <p className="muted">{guide.intro}</p>
        <p className="mt-3">
          <Button asChild variant="outline" className="tab">
            <a href="/user-manual.pdf" target="_blank" rel="noreferrer">{guide.pdf}</a>
          </Button>
        </p>
        {guide.sections.map((section) => (
          <div key={section.h} className="mt-4">
            <h3 className="font-bold">{section.h}</h3>
            {section.p.map((para) => <p key={para.slice(0, 24)} className="muted mt-2">{para}</p>)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
