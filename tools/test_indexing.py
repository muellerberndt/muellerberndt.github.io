"""Search metadata regression tests, including stale dates and noindex drift."""
from pathlib import Path
import shutil
import tempfile
import unittest

from build_company_site import publication_dates
from check_company_site import check_indexing

ROOT = Path(__file__).resolve().parents[1]


class PublicationDateTests(unittest.TestCase):
    def test_unchanged_build_retains_date_and_changed_page_advances(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory).resolve()
            (site / '_company').mkdir()
            (site / 'index.html').write_text('Home')
            (site / 'cadence').mkdir()
            page = site / 'cadence/index.html'
            page.write_text('Brain')
            routes = ['/', '/cadence/']
            publication_dates(site, routes, '2026-09-01')
            first = (site / '_company/indexing.json').read_bytes()
            publication_dates(site, routes, '2026-09-02')
            self.assertEqual(first, (site / '_company/indexing.json').read_bytes())
            page.write_text('Updated brain')
            self.assertEqual(publication_dates(site, routes, '2026-09-03'),
                             {'/': '2026-09-01', '/cadence/': '2026-09-03'})

    def test_published_site_and_noindex_regression(self):
        errors = []
        check_indexing(ROOT, errors)
        self.assertEqual(errors, [])
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory).resolve()
            # Only small HTML and indexing inputs are needed, not demo assets.
            for path in [*ROOT.rglob('index.html'), ROOT / '404.html',
                         *ROOT.glob('sitemap*.xml'), ROOT / '_company/indexing.json']:
                if any(part.startswith('.') for part in path.relative_to(ROOT).parts):
                    continue
                target = site / path.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
            page = site / 'index.html'
            page.write_text(page.read_text().replace('content="index, follow,', 'content="noindex, follow,'))
            check_indexing(site, errors)
            self.assertTrue(any('public page is not indexable' in error for error in errors))
            self.assertTrue(any('indexing record does not match' in error for error in errors))


if __name__ == '__main__':
    unittest.main()
