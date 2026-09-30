"""Guard the link-only research surface against accidental mirror restoration."""
from pathlib import Path
import shutil
import tempfile
import unittest

from build_company_site import RETIRED_PAPER_SLUGS, render_redirect
from check_company_site import check_research_publication

ROOT = Path(__file__).resolve().parents[1]


class ResearchPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.site = Path(self.temporary.name)
        (self.site / '_company').mkdir()
        shutil.copyfile(ROOT / '_company/layout.html', self.site / '_company/layout.html')
        for slug in ('', *RETIRED_PAPER_SLUGS):
            route = '/oph/papers/' + (slug + '/' if slug else '')
            path = self.site / route.lstrip('/') / 'index.html'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(render_redirect(route, '/research/#preprints', site_root=self.site))

    def errors(self):
        errors = []
        check_research_publication(self.site, errors)
        return errors

    def test_short_redirects_are_allowed(self):
        self.assertEqual(self.errors(), [])

    def test_published_tree_is_link_only(self):
        errors = []
        check_research_publication(ROOT, errors)
        self.assertEqual(errors, [])

    def test_pdf_and_inventory_restoration_is_rejected(self):
        for relative in ('pdf/research.pdf', 'from-observer-consensus-to-standard-physics/paper.pdf', 'papers.json', 'paper_release_manifest.json'):
            with self.subTest(path=relative):
                path = self.site / 'oph/papers' / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b'%PDF-1.7 retired mirror fixture')
                self.assertTrue(any('unexpected oph/papers/' in error for error in self.errors()))
                path.unlink()

    def test_full_article_cannot_hide_behind_a_redirect(self):
        path = self.site / 'oph/papers' / RETIRED_PAPER_SLUGS[0] / 'index.html'
        path.write_text(path.read_text() + '<article>Full paper content</article>')
        self.assertTrue(any('must be a short preprint redirect' in error for error in self.errors()))

    def test_new_mirror_route_is_rejected(self):
        path = self.site / 'oph/papers/new-paper/index.html'
        path.parent.mkdir()
        path.write_text('<h1>Full paper</h1>')
        self.assertTrue(any('unexpected oph/papers/new-paper' in error for error in self.errors()))

    def test_discovery_surfaces_cannot_advertise_mirrors(self):
        for name in ('sitemap.xml', 'oph/feed.json', 'llms.txt'):
            with self.subTest(path=name):
                path = self.site / name
                path.write_text('https://floatingpragma.io/oph/papers/old-paper/paper.pdf')
                self.assertTrue(any('still advertises retired paper mirrors' in error for error in self.errors()))
                path.unlink()


if __name__ == '__main__':
    unittest.main()
