Attribute VB_Name = "CromaMapaProducao"
Option Explicit

Private Const MAX_ASPECT_ERROR_PCT As Double = 3#
Private Const DELIMITER As String = ";"

Public Sub CromaImportarMapa()
    Dim csvPath As String
    Dim productionRoot As String
    Dim doc As Document
    Dim rows As Collection
    Dim headers As Object
    Dim pageMap As Object
    Dim importedCount As Long
    Dim missingCount As Long
    Dim invalidCount As Long
    Dim logText As String
    
    csvPath = CorelScriptTools.GetFileBox("Mapa Croma (*.csv)|*.csv|Todos os arquivos (*.*)|*.*", "Selecione o mapa exportado pelo Croma", 0)
    If Len(csvPath) = 0 Then Exit Sub
    
    productionRoot = CorelScriptTools.GetFolder("", "Selecione a pasta local PRODUÇÃO (In House)")
    If Len(productionRoot) = 0 Then Exit Sub
    
    Set rows = ReadCsv(csvPath, headers)
    If rows.Count = 0 Then
        MsgBox "O CSV não possui peças para importar.", vbExclamation, "Croma"
        Exit Sub
    End If
    
    If Not RequiredColumnsPresent(headers) Then
        MsgBox "O CSV não possui todas as colunas exigidas pela macro.", vbCritical, "Croma"
        Exit Sub
    End If
    
    Set doc = CreateDocument
    doc.Unit = cdrMillimeter
    doc.ReferencePoint = cdrTopLeft
    Set pageMap = CreateObject("Scripting.Dictionary")
    
    BuildPages doc, rows, headers, pageMap
    
    logText = "IMPORTAÇÃO CROMA - " & Format(Now, "yyyy-mm-dd hh:nn:ss") & vbCrLf & _
              "Mapa: " & csvPath & vbCrLf & _
              "Raiz dos arquivos: " & productionRoot & vbCrLf & vbCrLf
    
    Dim row As Variant
    For Each row In rows
        ImportRow doc, row, headers, pageMap, productionRoot, importedCount, missingCount, invalidCount, logText
    Next row
    
    WriteLog csvPath, logText & vbCrLf & _
        "Importadas: " & importedCount & vbCrLf & _
        "Arquivos ausentes: " & missingCount & vbCrLf & _
        "Peças incompatíveis: " & invalidCount & vbCrLf
    
    MsgBox "Montagem concluída." & vbCrLf & vbCrLf & _
           "Importadas: " & importedCount & vbCrLf & _
           "Arquivos ausentes: " & missingCount & vbCrLf & _
           "Peças incompatíveis: " & invalidCount & vbCrLf & vbCrLf & _
           "O log foi salvo ao lado do CSV.", _
           IIf(missingCount + invalidCount = 0, vbInformation, vbExclamation), "Croma"
End Sub

Private Sub BuildPages(ByVal doc As Document, ByVal rows As Collection, ByVal headers As Object, ByVal pageMap As Object)
    Dim row As Variant
    Dim seg As Long
    Dim pageW As Double, pageH As Double
    Dim p As Page
    
    For Each row In rows
        seg = CLng(ParseNumber(FieldValue(row, headers, "segmento")))
        If seg < 1 Then seg = 1
        
        If Not pageMap.Exists(CStr(seg)) Then
            pageW = ParseNumber(FieldValue(row, headers, "pagina_largura_cm")) * 10#
            pageH = ParseNumber(FieldValue(row, headers, "pagina_altura_cm")) * 10#
            
            If pageW <= 0 Or pageH <= 0 Then
                Err.Raise vbObjectError + 120, "Croma", "Tamanho de página inválido no segmento " & seg
            End If
            
            If pageMap.Count = 0 Then
                Set p = doc.Pages(1)
                p.SetSize pageW, pageH
            Else
                Set p = doc.AddPagesEx(1, pageW, pageH)
            End If
            
            pageMap.Add CStr(seg), p.Index
        End If
    Next row
End Sub

Private Sub ImportRow(ByVal doc As Document, ByVal row As Variant, ByVal headers As Object, ByVal pageMap As Object, _
                      ByVal productionRoot As String, ByRef importedCount As Long, ByRef missingCount As Long, _
                      ByRef invalidCount As Long, ByRef logText As String)
    On Error GoTo ImportError
    
    Dim seg As Long
    Dim piece As Long
    Dim material As String
    Dim fileName As String
    Dim fullPath As String
    Dim targetX As Double, targetY As Double
    Dim targetW As Double, targetH As Double
    Dim rotationDeg As Double
    Dim p As Page
    Dim sr As ShapeRange
    Dim actualW As Double, actualH As Double
    Dim aspectTarget As Double, aspectActual As Double, aspectError As Double
    
    seg = CLng(ParseNumber(FieldValue(row, headers, "segmento")))
    piece = CLng(ParseNumber(FieldValue(row, headers, "peca")))
    material = FieldValue(row, headers, "material")
    fileName = FieldValue(row, headers, "arquivo")
    
    If Len(fileName) = 0 Then
        missingCount = missingCount + 1
        logText = logText & "SEM ARQUIVO | segmento " & seg & " | peça " & piece & " | " & FieldValue(row, headers, "item") & vbCrLf
        Exit Sub
    End If
    
    fullPath = ResolveSourceFile(productionRoot, material, fileName)
    If Len(fullPath) = 0 Then
        missingCount = missingCount + 1
        logText = logText & "NÃO ENCONTRADO | " & material & " | " & fileName & " | segmento " & seg & " | peça " & piece & vbCrLf
        Exit Sub
    End If
    
    Set p = doc.Pages(CLng(pageMap(CStr(seg))))
    p.Activate
    
    doc.Unit = cdrMillimeter
    doc.ReferencePoint = cdrTopLeft
    
    Dim importFilter As ImportFilter
    Set importFilter = ActiveLayer.ImportEx(fullPath, cdrAutoSense)
    importFilter.Finish
    Set sr = ActiveSelectionRange
    If sr Is Nothing Or sr.Count = 0 Then
        invalidCount = invalidCount + 1
        logText = logText & "IMPORTAÇÃO VAZIA | " & fullPath & vbCrLf
        Exit Sub
    End If
    
    rotationDeg = ParseNumber(FieldValue(row, headers, "rotacao_graus"))
    If Abs(rotationDeg) > 0.0001 Then sr.Rotate rotationDeg
    
    targetW = ParseNumber(FieldValue(row, headers, "largura_cm")) * 10#
    targetH = ParseNumber(FieldValue(row, headers, "altura_cm")) * 10#
    targetX = ParseNumber(FieldValue(row, headers, "x_cm")) * 10#
    targetY = ParseNumber(FieldValue(row, headers, "y_cm")) * 10#
    
    sr.GetSize actualW, actualH
    If targetW <= 0 Or targetH <= 0 Or actualW <= 0 Or actualH <= 0 Then
        sr.Delete
        invalidCount = invalidCount + 1
        logText = logText & "DIMENSÃO INVÁLIDA | " & fullPath & vbCrLf
        Exit Sub
    End If
    
    aspectTarget = targetW / targetH
    aspectActual = actualW / actualH
    aspectError = Abs((aspectActual / aspectTarget) - 1#) * 100#
    
    If aspectError > MAX_ASPECT_ERROR_PCT Then
        sr.Delete
        invalidCount = invalidCount + 1
        logText = logText & "PROPORÇÃO INCOMPATÍVEL | " & fileName & _
                  " | esperado " & Format(targetW / 10#, "0.0") & "x" & Format(targetH / 10#, "0.0") & " cm" & _
                  " | importado " & Format(actualW / 10#, "0.0") & "x" & Format(actualH / 10#, "0.0") & " cm" & _
                  " | erro " & Format(aspectError, "0.0") & "%" & vbCrLf
        Exit Sub
    End If
    
    ' Dimensiona exatamente para o envelope calculado pelo Croma.
    sr.SetSize targetW, targetH
    
    ' CSV usa origem no canto superior esquerdo.
    ' Corel trabalha com Y crescente para cima, então usamos TopY - Y.
    sr.SetPosition p.LeftX + targetX, p.TopY - targetY
    
    importedCount = importedCount + 1
    logText = logText & "OK | segmento " & seg & " | peça " & piece & " | " & material & " | " & fileName & vbCrLf
    Exit Sub

ImportError:
    invalidCount = invalidCount + 1
    logText = logText & "ERRO | segmento " & seg & " | peça " & piece & " | " & fileName & " | " & Err.Description & vbCrLf
    Err.Clear
End Sub

Private Function ResolveSourceFile(ByVal rootFolder As String, ByVal material As String, ByVal fileName As String) As String
    Dim directPath As String
    
    If Len(material) > 0 Then
        directPath = AddSlash(rootFolder) & material & "\" & fileName
        If FileExists(directPath) Then
            ResolveSourceFile = directPath
            Exit Function
        End If
    End If
    
    directPath = AddSlash(rootFolder) & fileName
    If FileExists(directPath) Then
        ResolveSourceFile = directPath
        Exit Function
    End If
    
    ResolveSourceFile = FindFileRecursive(rootFolder, fileName)
End Function

Private Function FindFileRecursive(ByVal rootFolder As String, ByVal fileName As String) As String
    On Error GoTo Done
    
    Dim fso As Object
    Dim folder As Object
    Dim subFolder As Object
    Dim candidate As String
    
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set folder = fso.GetFolder(rootFolder)
    
    candidate = AddSlash(rootFolder) & fileName
    If fso.FileExists(candidate) Then
        FindFileRecursive = candidate
        Exit Function
    End If
    
    For Each subFolder In folder.SubFolders
        candidate = FindFileRecursive(subFolder.Path, fileName)
        If Len(candidate) > 0 Then
            FindFileRecursive = candidate
            Exit Function
        End If
    Next subFolder
Done:
End Function

Private Function FileExists(ByVal path As String) As Boolean
    On Error Resume Next
    FileExists = (Len(Dir$(path, vbNormal Or vbReadOnly Or vbHidden Or vbSystem)) > 0)
End Function

Private Function AddSlash(ByVal path As String) As String
    If Right$(path, 1) = "\" Then
        AddSlash = path
    Else
        AddSlash = path & "\"
    End If
End Function

Private Function ReadCsv(ByVal csvPath As String, ByRef headers As Object) As Collection
    Dim content As String
    Dim lines As Variant
    Dim line As String
    Dim values As Variant
    Dim rows As New Collection
    Dim i As Long, lineIndex As Long
    
    Set headers = CreateObject("Scripting.Dictionary")
    headers.CompareMode = 1
    
    content = ReadUtf8File(csvPath)
    If Len(content) = 0 Then
        Set ReadCsv = rows
        Exit Function
    End If
    
    If Left$(content, 1) = ChrW(&HFEFF) Then content = Mid$(content, 2)
    content = Replace(content, vbCrLf, vbLf)
    content = Replace(content, vbCr, vbLf)
    lines = Split(content, vbLf)
    
    If UBound(lines) < 0 Then
        Set ReadCsv = rows
        Exit Function
    End If
    
    line = CStr(lines(0))
    values = ParseDelimitedLine(line, DELIMITER)
    For i = LBound(values) To UBound(values)
        headers(Trim$(values(i))) = i
    Next i
    
    For lineIndex = 1 To UBound(lines)
        line = CStr(lines(lineIndex))
        If Len(Trim$(line)) > 0 Then rows.Add ParseDelimitedLine(line, DELIMITER)
    Next lineIndex
    
    Set ReadCsv = rows
End Function

Private Function ReadUtf8File(ByVal filePath As String) As String
    On Error GoTo ReadError
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile filePath
    ReadUtf8File = stream.ReadText
    stream.Close
    Set stream = Nothing
    Exit Function
ReadError:
    ReadUtf8File = ""
    On Error Resume Next
    If Not stream Is Nothing Then stream.Close
End Function

Private Function ParseDelimitedLine(ByVal line As String, ByVal delimiter As String) As Variant
    Dim values() As String
    Dim value As String
    Dim i As Long, count As Long
    Dim ch As String
    Dim inQuotes As Boolean
    
    ReDim values(0 To 0)
    
    For i = 1 To Len(line)
        ch = Mid$(line, i, 1)
        If ch = """" Then
            If inQuotes And i < Len(line) And Mid$(line, i + 1, 1) = """" Then
                value = value & """"
                i = i + 1
            Else
                inQuotes = Not inQuotes
            End If
        ElseIf ch = delimiter And Not inQuotes Then
            values(count) = value
            count = count + 1
            ReDim Preserve values(0 To count)
            value = ""
        Else
            value = value & ch
        End If
    Next i
    
    values(count) = value
    ParseDelimitedLine = values
End Function

Private Function FieldValue(ByVal row As Variant, ByVal headers As Object, ByVal name As String) As String
    If Not headers.Exists(name) Then
        FieldValue = ""
    ElseIf headers(name) > UBound(row) Then
        FieldValue = ""
    Else
        FieldValue = CStr(row(headers(name)))
    End If
End Function

Private Function RequiredColumnsPresent(ByVal headers As Object) As Boolean
    Dim required As Variant
    Dim key As Variant
    
    required = Array("segmento", "peca", "item", "material", "arquivo", "x_cm", "y_cm", _
                     "largura_cm", "altura_cm", "rotacao_graus", "pagina_largura_cm", "pagina_altura_cm")
    
    For Each key In required
        If Not headers.Exists(CStr(key)) Then Exit Function
    Next key
    
    RequiredColumnsPresent = True
End Function

Private Function ParseNumber(ByVal raw As String) As Double
    Dim clean As String
    clean = Trim$(raw)
    clean = Replace(clean, ",", ".")
    ParseNumber = Val(clean)
End Function

Private Sub WriteLog(ByVal csvPath As String, ByVal text As String)
    On Error Resume Next
    Dim folder As String
    Dim p As Long
    Dim f As Integer
    
    p = InStrRev(csvPath, "\")
    If p > 0 Then folder = Left$(csvPath, p)
    
    f = FreeFile
    Open folder & "corel-import-log.txt" For Output As #f
    Print #f, text
    Close #f
End Sub
