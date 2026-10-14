import os
import math
from typing import Tuple, Optional, Dict, Any
from pathlib import Path


class MaliciousFileException(Exception):
    def __init__(self, threat_type: str, details: Dict[str, Any]):
        super().__init__(f"Malicious file detected: {threat_type}")
        self.threat_type = threat_type
        self.details = details


class ThreatScannerService:
    # Known ransomware extensions
    RANSOMWARE_EXTENSIONS = {
        ".locked", ".crypto", ".crypt", ".enc", ".crypted", ".ransom",
        ".wnry", ".wannacry", ".locky", ".cerber", ".zepto", ".lockbit",
        ".blackcat", ".alphv", ".stop", ".djvu", ".makop", ".mallox",
        ".phobos", ".dharma", ".ryuk", ".conti", ".clop", ".blackmatter",
        ".hive", ".revil", ".sodinokibi", ".medusa", ".akira", ".rhysida",
        ".cactus", ".play", ".babuk", ".lockbit3", ".encr", ".crinf",
        ".r5a", ".aesir", ".thor", ".osiris", ".enc1", ".payme", ".ransomware"
    }

    # Known ransom note filenames (lowercase)
    RANSOM_NOTE_PATTERNS = {
        "readme_to_decrypt.txt", "how_to_restore_files.txt", "decrypt_files.html",
        "restore_files.txt", "how_to_recover.txt", "recovery_instructions.html",
        "readme_for_decrypt.txt", "restore_info.txt", "!_readme_!.txt",
        "decrypt_instructions.txt", "read_it.txt", "how_to_back.txt",
        "recovery_key.txt", "decryptor.html", "help_decrypt.txt"
    }

    # Executable extensions that shouldn't masquerade as documents
    EXECUTABLE_EXTENSIONS = {
        ".exe", ".scr", ".pif", ".vbs", ".bat", ".cmd", ".ps1", ".hta", ".cpl", ".jar"
    }

    # Common document and media extensions to protect
    DOCUMENT_EXTENSIONS = {
        ".txt", ".csv", ".tsv", ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".ppt", ".pptx", ".jpg", ".jpeg", ".png", ".gif", ".webp"
    }

    EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

    @staticmethod
    def calculate_entropy(data: bytes) -> float:
        """Calculates Shannon entropy of raw bytes (0.0 to 8.0)."""
        if not data:
            return 0.0
        byte_counts = [0] * 256
        for b in data:
            byte_counts[b] += 1
        entropy = 0.0
        total = len(data)
        for count in byte_counts:
            if count > 0:
                p = count / total
                entropy -= p * math.log2(p)
        return entropy

    def inspect_filename(self, filename: str) -> Optional[Tuple[str, str]]:
        """
        Fast pre-check on filename/path.
        Returns: (threat_type, reason) if malicious, else None.
        """
        lower_name = filename.lower()
        base_name = os.path.basename(lower_name)

        # 1. Ransom Note Check
        if base_name in self.RANSOM_NOTE_PATTERNS or "decrypt_instructions" in base_name or "how_to_restore" in base_name:
            return (
                "RANSOM_NOTE_DETECTED",
                f"File matches known ransomware extortion note pattern: '{base_name}'"
            )

        # 2. Ransomware Extension Check
        _, ext = os.path.splitext(base_name)
        if ext in self.RANSOMWARE_EXTENSIONS:
            return (
                "RANSOMWARE_EXTENSION_DETECTED",
                f"File has known ransomware extension '{ext}'"
            )

        # 3. Double-Extension Trick (e.g. invoice.pdf.exe, report.docx.vbs)
        parts = base_name.split(".")
        if len(parts) >= 3:
            first_ext = f".{parts[-2]}"
            second_ext = f".{parts[-1]}"
            if first_ext in self.DOCUMENT_EXTENSIONS and second_ext in self.EXECUTABLE_EXTENSIONS:
                return (
                    "DISGUISED_EXECUTABLE_TRAP",
                    f"Suspicious double extension '{first_ext}{second_ext}' designed to disguise executable as document"
                )

        return None

    def inspect_buffer(
        self,
        filename: str,
        initial_chunk: bytes,
        total_data_sample: Optional[bytes] = None
    ) -> Optional[Tuple[str, str, Dict[str, Any]]]:
        """
        Deep inspection of file header and initial content bytes.
        Returns: (threat_type, reason, details) if malicious, else None.
        """
        # First check filename
        name_threat = self.inspect_filename(filename)
        if name_threat:
            threat_type, reason = name_threat
            return threat_type, reason, {"matched": "filename_pattern"}

        # Check for EICAR test signature
        if self.EICAR_SIGNATURE in initial_chunk:
            return (
                "EICAR_TEST_VIRUS",
                "Contains standard EICAR anti-malware test signature",
                {"signature": "EICAR"}
            )

        _, ext = os.path.splitext(filename.lower())

        # 4. Disguised Windows PE / Linux ELF in document or image
        if ext in self.DOCUMENT_EXTENSIONS:
            if initial_chunk.startswith(b"MZ"):
                return (
                    "DISGUISED_EXECUTABLE_HEADER",
                    f"File extension is '{ext}' but binary contains Windows PE executable (MZ) header",
                    {"header": "MZ", "claimed_extension": ext}
                )
            if initial_chunk.startswith(b"\x7fELF"):
                return (
                    "DISGUISED_ELF_BINARY",
                    f"File extension is '{ext}' but binary contains Linux ELF executable header",
                    {"header": "ELF", "claimed_extension": ext}
                )

        # 5. High-Entropy Ransomware Encryption Check
        # Legitimate plaintext documents (txt, csv, tsv) have low entropy (typically 3.0 - 5.5).
        # Unencrypted PDF headers start with %PDF.
        # Unencrypted DOCX/XLSX start with PK\x03\x04 (ZIP).
        # If a file claiming to be docx/xlsx/pdf has near-maximum entropy (> 7.98) and lacks magic header:
        sample = total_data_sample if total_data_sample else initial_chunk
        if len(sample) >= 2048:
            entropy = self.calculate_entropy(sample[:16384])
            if ext in {".txt", ".csv", ".tsv"} and entropy > 7.6:
                return (
                    "HIGH_ENTROPY_ENCRYPTED_RANSOMWARE",
                    f"Text file has suspiciously high Shannon entropy ({entropy:.2f}/8.0), indicative of encrypted ransomware",
                    {"entropy": entropy, "extension": ext}
                )
            elif ext in {".pdf"} and not initial_chunk.startswith(b"%PDF") and entropy > 7.95:
                return (
                    "HIGH_ENTROPY_ENCRYPTED_RANSOMWARE",
                    f"PDF file lacks %PDF header and has high Shannon entropy ({entropy:.2f}/8.0), indicative of ransomware payload",
                    {"entropy": entropy, "extension": ext}
                )
            elif ext in {".docx", ".xlsx", ".pptx"} and not initial_chunk.startswith(b"PK\x03\x04") and entropy > 7.95:
                return (
                    "HIGH_ENTROPY_ENCRYPTED_RANSOMWARE",
                    f"Office document lacks PK header and has high Shannon entropy ({entropy:.2f}/8.0), indicative of ransomware payload",
                    {"entropy": entropy, "extension": ext}
                )

        return None


threat_scanner_service = ThreatScannerService()
