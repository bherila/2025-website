import './bootstrap';
import CustomLink from '@/components/link';
import MainTitle from '@/components/MainTitle';
import { CTAs } from '@/components/ctas';
import { createRoot } from 'react-dom/client';
import React from 'react';

function Home() {
  const Im = <>I&rsquo;m</>
  const Line = ({ children }: { children: React.ReactNode }) => <p className="py-2">{children}</p>
  return (
    <div className="max-w-2xl mx-auto">
      <MainTitle>Hi, {Im} Ben</MainTitle>

      <Line>{Im} currently:</Line>
      <ul className="list-disc list-inside pl-4">
        <li>
          a Software Engineer at Meta. {Im} currently working on{' '}
          <CustomLink href="https://horizon.meta.com" rel="noopener">
            Horizon Worlds
          </CustomLink>
          .
        </li>
        <li>
          a venture partner in{' '}
          <CustomLink href="https://www.pioneerfund.vc/team" rel="noopener">
            Pioneer Fund
          </CustomLink>
          , a pre-seed fund that invests in early-stage{' '}
          <CustomLink href="https://www.ycombinator.com" rel="noopener">
            YC
          </CustomLink>{' '}
          startups.
        </li>
      </ul>

      <Line>
        Before Meta, I worked at Airbnb on the i18n team. We expanded Airbnb.com to 32 new countries, added support for
        right-to-left, 4-byte unicode, and more. You can read about it on the{' '}
        <CustomLink
          href="https://medium.com/airbnb-engineering/building-airbnbs-internationalization-platform-45cf0104b63c"
          rel="noopener"
        >
          Airbnb engineering blog
        </CustomLink>
        .
      </Line>

      <Line>
        Before Airbnb, I was the co-founder and CTO of an e-commerce wine company called{' '}
        <CustomLink href="https://www.undergroundcellar.com">Underground Cellar</CustomLink>, backed by Bling Capital and
        Y Combinator (Winter 2015 batch).
      </Line>

      <Line>
        I began my professional career at Microsoft, briefly on the Office Graphics platform in 2009, and {' '}
        <CustomLink
          href="https://web.archive.org/web/20240806233349/https://servercore.net/2013/07/meet-the-new-server-core-program-manager/"
          rel="noopener"
        >
          made Windows Server smaller
        </CustomLink>{' '}
        through my work on MinWin.
      </Line>

      <Line>
        Before Microsoft, I worked on numerous personal projects and business ventures, and built the online presence for
        companies including{' '}
        <CustomLink href="/projects/roessner/" rel="noopener">
          Roessner &amp; Co.
        </CustomLink>
        ,{' '}
        <CustomLink href="/projects/walsh/" rel="noopener">
          The Walsh Company
        </CustomLink>
        ,{' '}
        <CustomLink href="/projects/marisol/" rel="noopener">
          Marisol
        </CustomLink>,
        {' '}and{' '}
        <CustomLink href="/projects/">more</CustomLink>.
      </Line>
      <CTAs />
    </div>
  )
}

const homeElement = document.getElementById('home');
if (homeElement) {
  createRoot(homeElement).render(<Home />);
}
