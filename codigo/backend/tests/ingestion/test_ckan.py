"""Resource-selection tests against a captured CKAN payload -- no network involved."""

from app.modules.ingestion.ckan import _resources_from_payload, select_per_record_resources

# A trimmed, real response shape from datosabiertos.gob.ec's package_show for
# "homicidios-intencionales": two per-record ("_pm_") files and two data
# dictionaries ("_dd_") that must never be selected as data.
PACKAGE_SHOW_PAYLOAD = {
    "result": {
        "resources": [
            {
                "id": "cb8f704e-2b27-4d7f-9431-d40c4e27fa48",
                # The CKAN "name" field is a free-text label; it has been
                # observed with stray Unicode characters, which is exactly
                # why selection must not rely on it.
                "name": "mdi_homicidios_intencionales_pm_2026 │enero_agosto.xlsx",
                "format": "XLSX",
                "url": (
                    "https://www.datosabiertos.gob.ec/dataset/0ec65ab4-e6ab-40ab-aab9-c91e912f9faf/"
                    "resource/cb8f704e-2b27-4d7f-9431-d40c4e27fa48/download/"
                    "mdi_homicidiosintencionales_pm_2026_enero_agosto.xlsx"
                ),
                "size": 981183,
            },
            {
                "id": "36b055c8-e10c-4e57-ba25-3046ca5ef15d",
                "name": "mdi_homicidios_intencionales_pm_2014-2025.xlsx",
                "format": "XLSX",
                "url": (
                    "https://www.datosabiertos.gob.ec/dataset/0ec65ab4-e6ab-40ab-aab9-c91e912f9faf/"
                    "resource/36b055c8-e10c-4e57-ba25-3046ca5ef15d/download/"
                    "mdi_homicidiosintencionales_pm_2014_2025.xlsx"
                ),
                "size": 6718875,
            },
            {
                "id": "cf79ef2c-053f-40f0-ad04-683d1e800a31",
                "name": "mdi_homicidios_intencionales_dd_2025.xlsx",
                "format": "XLSX",
                "url": (
                    "https://www.datosabiertos.gob.ec/dataset/0ec65ab4-e6ab-40ab-aab9-c91e912f9faf/"
                    "resource/cf79ef2c-053f-40f0-ad04-683d1e800a31/download/"
                    "mdi_homicidios_intencionales_dd_2025.xlsx"
                ),
                "size": 132474,
            },
            {
                "id": "2eacdb56-4bd6-46e0-bdff-a0b1958c5cfc",
                "name": "mdi_homicidios_intencionales_dd_historica.xlsx",
                "format": "XLSX",
                "url": (
                    "https://www.datosabiertos.gob.ec/dataset/0ec65ab4-e6ab-40ab-aab9-c91e912f9faf/"
                    "resource/2eacdb56-4bd6-46e0-bdff-a0b1958c5cfc/download/"
                    "mdi_homicidios_intencionales_dd_2014_2024.xlsx"
                ),
                "size": 93032348,
            },
        ]
    }
}


def test_selects_only_per_record_xlsx_resources():
    resources = _resources_from_payload(PACKAGE_SHOW_PAYLOAD)

    selected = select_per_record_resources(resources)

    assert {resource.id for resource in selected} == {
        "cb8f704e-2b27-4d7f-9431-d40c4e27fa48",
        "36b055c8-e10c-4e57-ba25-3046ca5ef15d",
    }


def test_excludes_data_dictionary_resources():
    resources = _resources_from_payload(PACKAGE_SHOW_PAYLOAD)

    selected = select_per_record_resources(resources)

    assert all("_dd_" not in resource.url for resource in selected)
