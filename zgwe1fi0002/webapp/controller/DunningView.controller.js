sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/TextArea",
    "sap/m/VBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/ScrollContainer",
    "sap/ui/core/HTML"
], function (
    Controller, JSONModel, Filter, FilterOperator,
    MessageBox, MessageToast,
    Dialog, Button, Input, Label, TextArea, VBox,
    SelectDialog, StandardListItem, ScrollContainer, HTML
) {
    "use strict";

return Controller.extend("zgwe1fi0002.zgwe1fi0002.controller.DunningView", {

        /* ─────────────────────────────────────────
           Formatters
        ───────────────────────────────────────── */
        formatter: {
            overdueDaysState: function (iDays) {
                if (!iDays || iDays <= 0) return "None";
                if (iDays > 90) return "Error";
                if (iDays > 30) return "Warning";
                return "Success";
            },

            clearStatusState: function (sStatus) {
                return { N: "Error", P: "Warning", C: "Success" }[sStatus] || "None";
            },

            clearStatusText: function (sStatus) {
                return { N: "미반제", P: "일부반제", C: "반제완료" }[sStatus] || (sStatus || "-");
            },

            clearStatusIcon: function (sStatus) {
                return {
                    N: "sap-icon://sys-cancel",
                    P: "sap-icon://lateness",
                    C: "sap-icon://sys-approve"
                }[sStatus] || "";
            },

            lprioState: function (sLprio) {
                return { A: "Error", B: "Warning", C: "Success" }[sLprio] || "None";
            },

            lprioText: function (sLprio) {
                return { A: "고위험", B: "주의", C: "정상" }[sLprio] || (sLprio || "-");
            },

            formatAmount: function (sAmount, sWaers) {
                if (sAmount === null || sAmount === undefined || sAmount === "") return "0";
                const sCurrency = sWaers || "KRW";
                return new Intl.NumberFormat("ko-KR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(parseFloat(sAmount)) + " " + sCurrency;
            }
        },

        /* ─────────────────────────────────────────
           Lifecycle
        ───────────────────────────────────────── */
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteOverviewView");
        },

        onInit: function () {
            this.getView().setModel(new JSONModel({
                totalCount:       0,
                totalAmount:      0,
                totalAmountScale: "",
                maxOverdue:       0,
                avgOverdue:       0,
                noDataText:       "조회 조건을 입력하고 조회 버튼을 눌러주세요."
            }), "view");

            this.getView().setModel(new JSONModel({
                overdueRanges:     [],
                customerTop5:      [],
                lprioDistribution: [],
                statusDistribution: []
            }), "dunn");

            var oTable = this.byId("dunningTable");
            oTable.attachUpdateFinished(this._updateKPIs, this);

            // 라우트 매칭 시점에 바인딩 필터 적용 (async 렌더링 이후 보장)
            this.getOwnerComponent().getRouter()
                .getRoute("RouteDunningView")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oTable   = this.byId("dunningTable");
            var oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            oBinding.filter([new Filter("OverdueDays", FilterOperator.GT, 0)]);

            if (oBinding.isSuspended()) {
                oBinding.resume();
            }
        },

        /* ─────────────────────────────────────────
           Filter
        ───────────────────────────────────────── */
        onSearch: function () {
            const sPartner = this.byId("inputPartner").getValue().trim();
            const sBukrs   = this.byId("inputBukrs").getValue().trim();
            const iOverdue = parseInt(this.byId("inputOverdue").getValue()) || 0;

            const aFilters = [];
            if (sBukrs)       aFilters.push(new Filter("Bukrs",     FilterOperator.EQ, sBukrs));
            if (sPartner)     aFilters.push(new Filter("PartnerNo", FilterOperator.EQ, sPartner));
            if (iOverdue > 0) aFilters.push(new Filter("OverdueDays", FilterOperator.GE, iOverdue));

            const oTable   = this.byId("dunningTable");
            const oBinding = oTable.getBinding("items");
            const oVM      = this.getView().getModel("view");

            oVM.setProperty("/noDataText", "조회결과가 없습니다.");

            aFilters.push(new Filter("OverdueDays", FilterOperator.GT, 0));
            const oCombined = new Filter(aFilters, true);

            if (oBinding.isSuspended()) {
                oBinding.filter(oCombined);
                oBinding.resume();
            } else {
                oBinding.filter(oCombined);
            }
        },

        onReset: function () {
            this.byId("inputPartner").setValue("");
            this.byId("inputBukrs").setValue("");
            this.byId("inputOverdue").setValue("");
            const oBinding = this.byId("dunningTable").getBinding("items");
            if (oBinding) {
                oBinding.filter([new Filter("OverdueDays", FilterOperator.GT, 0)]);
            }
        },

        
        // BP 서치헬프 (F4)
        onPartnerValueHelp: function () {
            this.getOwnerComponent().getModel().read("/DunningSet", {
                urlParameters: { "$select": "PartnerNo,CompName,OverdueDays" },
                success: (oData) => {
                    const mSeen = new Map();
                    (oData.results || []).filter((o) => parseInt(o.OverdueDays || 0) > 0).forEach((o) => {
                        if (o.PartnerNo && !mSeen.has(o.PartnerNo)) mSeen.set(o.PartnerNo, o.CompName || "");
                    });
                    this._openPartnerDialog(
                        Array.from(mSeen.entries())
                             .map(([no, name]) => ({ PartnerNo: no, CompName: name }))
                             .sort((a, b) => a.PartnerNo.localeCompare(b.PartnerNo))
                    );
                },
                error: () => MessageToast.show("거래처 목록을 불러오지 못했습니다.")
            });
        },

        _openPartnerDialog: function (aPartners) {
            if (!this._oPartnerDialog) {
                this._oPartnerDialog = new SelectDialog({
                    title:      "거래처(BP) 검색",
                    noDataText: "검색 결과가 없습니다.",
                    search: (oEvent) => {
                        const sVal = oEvent.getParameter("value").trim();
                        const oFilter = sVal
                            ? new Filter([
                                new Filter("PartnerNo", FilterOperator.Contains, sVal),
                                new Filter("CompName",  FilterOperator.Contains, sVal)
                              ], false) // OR
                            : [];
                        oEvent.getParameter("itemsBinding").filter(oFilter);
                    },
                    confirm: (oEvent) => {
                        const oItem = oEvent.getParameter("selectedItem");
                        if (oItem) {
                            this.byId("inputPartner").setValue(oItem.getTitle());
                        }
                    },
                    cancel: () => {}
                });

                this._oPartnerDialog.bindAggregation("items", {
                    path: "/",
                    template: new StandardListItem({
                        title:       "{PartnerNo}",
                        description: "{CompName}",
                        type:        "Active"
                    })
                });

                this.getView().addDependent(this._oPartnerDialog);
            }

            this._oPartnerDialog.setModel(new JSONModel(aPartners));
            this._oPartnerDialog.open();
        },

        // KPI 집계
        _updateKPIs: function () {
            const oBinding = this.byId("dunningTable").getBinding("items");
            if (!oBinding) return;

            // getItems()는 growing 테이블의 렌더된 항목만 반환 → 필터된 전체 context 사용
            const aCtx = oBinding.getContexts(0, oBinding.getLength());
            const oVM  = this.getView().getModel("view");

            let fTotal = 0, iMaxOverdue = 0, iTotalOverdue = 0;
            aCtx.forEach((oCtx) => {
                const o = oCtx.getObject();
                if (!o) return;
                fTotal        += parseFloat(o.Skfor || 0);
                const iDays    = parseInt(o.OverdueDays || 0);
                iMaxOverdue    = Math.max(iMaxOverdue, iDays);
                iTotalOverdue += iDays;
            });

            const iCount = aCtx.length;
            const iAvg   = iCount > 0 ? Math.round(iTotalOverdue / iCount) : 0;
            let displayAmount = Math.round(fTotal), displayScale = "";
            if (fTotal >= 100000000) {
                displayAmount = parseFloat((fTotal / 100000000).toFixed(1));
                displayScale  = "억";
            } else if (fTotal >= 10000) {
                displayAmount = Math.round(fTotal / 10000);
                displayScale  = "만";
            }

            oVM.setData({
                totalCount:       iCount,
                totalAmount:      displayAmount,
                totalAmountScale: displayScale,
                maxOverdue:       iMaxOverdue,
                avgOverdue:       iAvg
            });

            this._updateCharts(aCtx);
        },

        _updateCharts: function (aCtx) {
            var mRange    = { "1-30일": 0, "31-60일": 0, "61-90일": 0, "90일 초과": 0 };
            var mLprio    = { "고위험": 0, "주의": 0, "정상": 0 };
            var mStatus   = { "미반제": 0, "일부반제": 0, "반제완료": 0 };
            var mCustomer = {};

            aCtx.forEach(function (oCtx) {
                var o = oCtx.getObject();
                if (!o) return;
                var iDays = parseInt(o.OverdueDays || 0);
                if      (iDays > 90) mRange["90일 초과"]++;
                else if (iDays > 60) mRange["61-90일"]++;
                else if (iDays > 30) mRange["31-60일"]++;
                else                 mRange["1-30일"]++;

                var sLprio = { A: "고위험", B: "주의", C: "정상" }[o.Lprio];
                if (sLprio) mLprio[sLprio]++;

                var sStatus = { N: "미반제", P: "일부반제", C: "반제완료" }[o.ClearStatus];
                if (sStatus) mStatus[sStatus]++;

                var sKey = (o.CompName || o.PartnerNo || "?");
                mCustomer[sKey] = (mCustomer[sKey] || 0) + parseFloat(o.Skfor || 0);
            });

            var aTop5 = Object.keys(mCustomer)
                .map(function (k) { return { label: k, amount: Math.round(mCustomer[k] / 10000) }; })
                .sort(function (a, b) { return b.amount - a.amount; })
                .slice(0, 5);

            var oDunnModel = this.getView().getModel("dunn");
            oDunnModel.setData({
                overdueRanges:     Object.keys(mRange).map(function (k) { return { label: k, count: mRange[k] }; }),
                customerTop5:      aTop5,
                lprioDistribution: Object.keys(mLprio).map(function (k)  { return { label: k, count: mLprio[k] }; }),
                statusDistribution: Object.keys(mStatus).map(function (k) { return { label: k, count: mStatus[k] }; })
            });
        },

        //   독촉장 미리보기 다이얼로그
        onItemPress: function (oEvent) {
            const oData = oEvent.getSource().getBindingContext()?.getObject();
            if (oData) this._openDunningDialog(oData);
        },


        _esc: function (s) {
            return String(s || "")
                .replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        },

        _buildDunningHtml: function (oData) {
            const e           = this._esc.bind(this);
            const today       = new Date().toLocaleDateString("ko-KR");
            const fmt         = (dt) => dt ? new Date(dt).toLocaleDateString("ko-KR") : "-";
            const num         = (v)  => new Intl.NumberFormat("ko-KR").format(Math.round(parseFloat(v || 0)));
            const dueFmt      = fmt(oData.DueDate);
            const deadline    = new Date();
            deadline.setDate(deadline.getDate() + 3);
            const deadlineFmt = deadline.toLocaleDateString("ko-KR");

            return `
<div style="width:100%;color:#333;font-size:14px;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px double #c00;padding-bottom:14px;margin-bottom:24px">
    <div style="font-size:26px;font-weight:bold;letter-spacing:6px">최후통첩장</div>
    <div style="font-size:12px;color:#888">발행일: ${today}</div>
  </div>
  <div style="background:#fff5f5;border-left:5px solid #c00;padding:13px 18px;margin-bottom:20px">
    <span style="font-size:17px;font-weight:bold">${e(oData.CompName) || "거래처"} 귀중</span>
    <span style="font-size:12px;color:#666;margin-left:16px">BP: ${e(oData.PartnerNo) || "-"} | 회사코드: ${e(oData.Bukrs)}</span>
  </div>
  <p style="line-height:2.0;margin:0 0 20px;color:#444;font-size:14px">
    안녕하십니까. 평소 저희 회사와의 거래에 감사드립니다.
    아래 미납 채무가 지급 기일을 경과하였으므로 조속한 납부를 요청드립니다.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:18px">
    <tr style="background:#c00;color:#fff">
      <th colspan="4" style="padding:10px 14px;text-align:left;letter-spacing:1px;font-size:14px">■ 미납 내역</th>
    </tr>
    <tr>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;width:20%;font-weight:bold">전표번호</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;width:30%">${e(oData.Belnr)} (${e(oData.Gjahr)}년)</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;width:20%;font-weight:bold">전기일</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;width:30%">${fmt(oData.Budat)}</td>
    </tr>
    <tr>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;font-weight:bold">지급 만기일</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;color:#c00;font-weight:bold">${dueFmt}</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;font-weight:bold">연체일수</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;color:#c00;font-weight:bold">${oData.OverdueDays || 0}일 경과</td>
    </tr>
    <tr>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;font-weight:bold">지불조건</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0">${e(oData.Zterm) || "-"} (${oData.ZtermDays || 0}일)</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0;background:#fafafa;font-weight:bold">여신 한도</td>
      <td style="padding:11px 14px;border:1px solid #e0e0e0">${num(oData.Klimk)} ${e(oData.Waers) || "KRW"}</td>
    </tr>
    <tr>
      <td style="padding:13px 14px;border:2px solid #c00;background:#fff0f0;font-weight:bold;font-size:15px">미납금액</td>
      <td style="padding:13px 14px;border:2px solid #c00;background:#fff0f0;font-size:20px;font-weight:bold;color:#c00" colspan="3">
        ${num(oData.Skfor)} ${e(oData.Waers) || "KRW"}
      </td>
    </tr>
  </table>
  <div style="background:#fff8e1;border:1px solid #ffc107;border-radius:4px;padding:13px 16px;margin-bottom:10px;font-size:13px;line-height:1.9">
    ⚠ 위 미납금액을 <strong style="color:#c00">${deadlineFmt}</strong>까지 납부하여 주시기 바랍니다.
    납부가 어려우신 경우 해당 일자 이전에 반드시 담당자에게 먼저 연락해 주시기 바랍니다.
  </div>
  <div style="background:#fff0f0;border:1px solid #e57373;border-radius:4px;padding:13px 16px;margin-bottom:20px;font-size:13px;line-height:1.9;color:#b71c1c">
    🚨 <strong>기한 내 미납 시:</strong> 당사 내부 방침에 따라 <strong>여신 한도 축소, 거래 중단</strong> 등의 불이익이 발생할 수 있으며, 법적 절차(채권 추심·소송)가 진행될 수 있습니다.
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;padding-top:12px">
    <div style="font-size:11px;color:#bbb">본 독촉장은 SAP 시스템에서 자동 발행된 문서입니다. | 회사코드: ${e(oData.Bukrs)}</div>
    <div style="text-align:right">
      <div style="font-size:14px;font-weight:bold">${today}</div>
      <div style="font-size:13px;color:#555">재무관리팀 드림</div>
    </div>
  </div>
</div>`;
        },

        _openDunningDialog: function (oData) {
            const sHtml = this._buildDunningHtml(oData);

            const oHtmlCtrl = new HTML({ preferDOM: true });
            oHtmlCtrl.setContent(`<div style="box-sizing:border-box;padding:16px 24px">${sHtml}</div>`);

            const oDialog = new Dialog({
                title:         "독촉장 미리보기",
                contentWidth:  "90%",
                contentHeight: "90%",
                draggable:     true,
                resizable:     true,
                afterOpen: function () {
                    // HTML 컨트롤 wrapper를 block + 전체폭으로 강제
                    const el = oHtmlCtrl.getDomRef();
                    if (el) {
                        el.style.display = "block";
                        el.style.width   = "100%";
                    }
                },
                content: [
                    new ScrollContainer({
                        vertical: true, horizontal: false, height: "100%", width: "100%",
                        content: [oHtmlCtrl]
                    })
                ],
                beginButton: new Button({
                    text: "PDF 다운로드", icon: "sap-icon://print", type: "Emphasized",
                    press: () => {
                        const oPrintWin = window.open("", "_blank");
                        oPrintWin.document.write(`<!DOCTYPE html><html><head>
                            <meta charset="UTF-8">
                            <title>지급독촉장</title>
                            <style>
                                * { box-sizing: border-box; margin: 0; padding: 0; }
                                html, body { width: 100%; height: 100%; }
                                body { font-family: 'Malgun Gothic', AppleGothic, sans-serif; }
                                .dunning-wrap { width: 100%; padding: 36px 44px; }
                                @media print {
                                    @page { size: A4; margin: 6mm 8mm; }
                                    html, body { width: 210mm; }
                                    .dunning-wrap { padding: 0; }
                                }
                            </style>
                        </head><body><div class="dunning-wrap">${sHtml}</div></body></html>`);
                        oPrintWin.document.close();
                        oPrintWin.focus();
                        oPrintWin.onload = function () {
                            oPrintWin.print();
                            oPrintWin.close();
                        };
                    }
                }),
                endButton: new Button({
                    text: "닫기",
                    press: () => { oDialog.close(); oDialog.destroy(); }
                }),
                afterClose: () => oDialog.destroy()
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        
        // 메일 발송 (mailto: 실제 발송)
        onSendMail: function () {
            const aSelected = this.byId("dunningTable").getSelectedItems();
            if (!aSelected.length) {
                MessageBox.warning("메일을 발송할 항목을 선택해 주세요.");
                return;
            }
            if (aSelected.length > 1) {
                MessageBox.warning("메일 발송은 1건씩만 가능합니다.\n항목을 1개만 선택해 주세요.");
                return;
            }
            const aData = aSelected.map((oItem) => oItem.getBindingContext().getObject());
            this._openMailDialog(aData);
        },

        _openMailDialog: function (aData) {
            const today    = new Date().toLocaleDateString("ko-KR");
            const sSubject = `[지급독촉] ${aData.length}건 미납 채무 납부 요청 (${today})`;
            const sBodyTxt = this._buildMailBody(aData);

            const oToInput      = new Input({ value: "imsunbow@gmail.com", placeholder: "수신자 이메일 (필수)", width: "100%" });
            const oCcInput      = new Input({ placeholder: "참조 이메일 (선택)", width: "100%" });
            const oSubjectInput = new Input({ value: sSubject, width: "100%" });
            const oBodyArea     = new TextArea({
                value: sBodyTxt, width: "100%", rows: 10,
                growing: true, growingMaxLines: 18
            });

            const oContent = new VBox({
                width: "100%",
                items: [
                    new Label({ text: "받는 사람", required: true, design: "Bold" }), oToInput,
                    new Label({ text: "참조 (CC)", design: "Bold" }),                 oCcInput,
                    new Label({ text: "제목",       design: "Bold" }),                 oSubjectInput,
                    new Label({ text: "본문",       design: "Bold" }),                 oBodyArea
                ]
            });
            oContent.addStyleClass("sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom");

            const oSendBtn = new Button({ text: "발송", icon: "sap-icon://email", type: "Emphasized" });

            const oDialog = new Dialog({
                title: "독촉장 메일 작성", contentWidth: "580px",
                content: [new ScrollContainer({ vertical: true, horizontal: false, height: "100%", content: [oContent] })],
                beginButton: oSendBtn,
                endButton: new Button({ text: "취소", press: () => { oDialog.close(); oDialog.destroy(); } }),
                afterClose: () => oDialog.destroy()
            });

            oSendBtn.attachPress(() => {
                const sTo   = oToInput.getValue().trim();
                const sCc   = oCcInput.getValue().trim();
                const sSub  = oSubjectInput.getValue();
                const sBody = oBodyArea.getValue();

                if (!sTo) { MessageToast.show("수신자 이메일을 입력해 주세요."); return; }

                const sUrl = "https://mail.google.com/mail/?view=cm&fs=1"
                    + "&to="   + encodeURIComponent(sTo)
                    + (sCc  ? "&cc="   + encodeURIComponent(sCc)  : "")
                    + "&su="   + encodeURIComponent(sSub)
                    + "&body=" + encodeURIComponent(sBody);

                window.open(sUrl, "_blank");
                oDialog.close();
                this.byId("dunningTable").removeSelections(true);
                MessageToast.show("Gmail이 열렸습니다. 보내기를 클릭하면 발송됩니다.");
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _showMailSentResult: function (sTo, sCc, sSub, aData) {
            const e   = this._esc.bind(this);
            const num = (v) => new Intl.NumberFormat("ko-KR").format(Math.round(parseFloat(v || 0)));
            const now = new Date().toLocaleString("ko-KR");

            const sHtml = `
<div style="font-family:'Malgun Gothic',AppleGothic,sans-serif;padding:24px 20px;color:#333">
  <div style="text-align:center;margin-bottom:20px">
    <div style="width:64px;height:64px;background:#e6f4ea;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="#1a7f37"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
    </div>
    <div style="font-size:18px;font-weight:bold;color:#1a7f37">메일 발송 완료</div>
    <div style="font-size:12px;color:#888;margin-top:4px">${e(now)}</div>
  </div>
  <div style="background:#f8f9fa;border-radius:6px;padding:14px 16px;font-size:13px;line-height:2;margin-bottom:16px;border:1px solid #e0e0e0">
    <div><strong style="display:inline-block;width:80px;color:#555">받는 사람</strong>${e(sTo)}</div>
    ${sCc ? `<div><strong style="display:inline-block;width:80px;color:#555">참조</strong>${e(sCc)}</div>` : ""}
    <div><strong style="display:inline-block;width:80px;color:#555">제목</strong>${e(sSub)}</div>
    <div><strong style="display:inline-block;width:80px;color:#555">독촉 건수</strong><span style="color:#c00;font-weight:bold">${aData.length}건</span></div>
  </div>
  <div style="font-size:12px;color:#666;font-weight:bold;margin-bottom:8px">발송 내역</div>
  ${aData.map((o, i) => `
  <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid #e8e8e8;border-radius:4px;padding:8px 12px;margin-bottom:6px;font-size:12px;background:#fff">
    <div><strong>[${i + 1}] ${e(o.CompName || "거래처")}</strong> <span style="color:#888">(BP: ${e(o.PartnerNo || "-")})</span></div>
    <div style="color:#c00;font-weight:bold;white-space:nowrap">${num(o.Skfor)} ${e(o.Waers || "KRW")}</div>
  </div>`).join("")}
</div>`;

            const oResultDialog = new Dialog({
                title: "발송 결과",
                contentWidth: "500px",
                content: [new ScrollContainer({
                    vertical: true, horizontal: false, height: "100%",
                    content: [new HTML({ content: sHtml })]
                })],
                endButton: new Button({
                    text: "확인", type: "Emphasized",
                    press: () => { oResultDialog.close(); oResultDialog.destroy(); }
                }),
                afterClose: () => oResultDialog.destroy()
            });

            this.getView().addDependent(oResultDialog);
            oResultDialog.open();
        },

        _buildMailBody: function (aData) {  
            const today = new Date().toLocaleDateString("ko-KR");
            const fmt   = (dt) => dt ? new Date(dt).toLocaleDateString("ko-KR") : "-";
            const num   = (v)  => new Intl.NumberFormat("ko-KR").format(Math.round(parseFloat(v || 0)));
            const line  = "━".repeat(42);

            let s  = `[지급 독촉장]\n`;
            s += "안녕하십니까.\n";
            s += "평소 저희 회사와의 거래에 감사드립니다.\n\n";
            s += "아래 미납 채무가 지급 기일을 경과하였으므로,\n";
            s += "조속한 시일 내에 납부하여 주시기 바랍니다.\n\n";
            s += line + "\n";

            aData.forEach((o, i) => {
                s += `\n[${i + 1}] ${o.CompName || "거래처"}  (BP: ${o.PartnerNo || "-"})\n`;
                s += `  · 전표번호  : ${o.Belnr} / ${o.Gjahr}년\n`;
                s += `  · 전기일   : ${fmt(o.Budat)}\n`;
                s += `  · 지급만기일 : ${fmt(o.DueDate)}\n`;
                s += `  · 연체일수  : ${o.OverdueDays || 0}일\n`;
                s += `  · 미납금액  : ${num(o.Skfor)} ${o.Waers || "KRW"}\n`;
                s += `  · 지불조건  : ${o.Zterm || "-"} (${o.ZtermDays || 0}일)\n`;
            });

            s += "\n" + line + "\n\n";
            s += "납부가 어려우신 경우 담당자에게 먼저 연락해 주시기 바랍니다.\n\n";
            s += "감사합니다.\n";
            s += "재무관리팀 드림";

            return s;
        },

        //  엑셀 내보내기
        onExcelExport: function () {
            const oBinding = this.byId("dunningTable").getBinding("items");
            if (!oBinding || !oBinding.getLength()) {
                MessageToast.show("내보낼 데이터가 없습니다.");
                return;
            }

            sap.ui.require(["sap/ui/export/Spreadsheet"], (Spreadsheet) => {
                const oSpreadsheet = new Spreadsheet({
                    workbook: {
                        columns: [
                            { label: "회사코드",  property: "Bukrs",       type: "string", width: 10 },
                            { label: "전표번호",  property: "Belnr",       type: "string", width: 14 },
                            { label: "회계연도",  property: "Gjahr",       type: "string", width: 10 },
                            { label: "BP번호",    property: "PartnerNo",   type: "string", width: 14 },
                            { label: "거래처명",  property: "CompName",    type: "string", width: 24 },
                            { label: "전기일",    property: "Budat",       type: "date",   width: 14 },
                            { label: "만기일",    property: "DueDate",     type: "date",   width: 14 },
                            { label: "미납금액",  property: "Skfor",       type: "number", width: 16 },
                            { label: "통화",      property: "Waers",       type: "string", width:  8 },
                            { label: "연체일",    property: "OverdueDays", type: "number", width: 10 },
                            { label: "반제상태",  property: "ClearStatus", type: "string", width: 10 },
                            { label: "등급",      property: "Lprio",       type: "string", width:  8 },
                            { label: "지불조건",  property: "Zterm",       type: "string", width: 10 },
                            { label: "여신한도",  property: "Klimk",       type: "number", width: 16 }
                        ]
                    },
                    dataSource: oBinding,
                    fileName: "독촉장_" + new Date().toLocaleDateString("ko-KR").replace(/[\s.]/g, "") + ".xlsx"
                });

                oSpreadsheet.build()
                    .then(() => MessageToast.show("엑셀 파일이 다운로드되었습니다."))
                    .catch((err) => MessageBox.error("내보내기 실패: " + (err.message || err)))
                    .finally(() => oSpreadsheet.destroy());
            });
        }
    });
});
